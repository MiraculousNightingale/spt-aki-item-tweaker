import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DependencyContainer } from "tsyringe";

import dynamicSelectors from "../config/dynamic_selectors.json";
import manualOverwrite from "../config/manual_overwrite.json";

import { VerboseLogger } from "./verbose_logger";
import { Applicator, ApplicatorLogFormat } from "./applicator";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { LogBackgroundColor } from "@spt-aki/models/spt/logging/LogBackgroundColor";

type Selector = {
    filterProperty: string;
    filterValues: any[];
    multiply?: object;
    set?: object;
    priority?: number
}

type Overwrite = {
    multiply?: object;
    set?: object;
}

class ItemTweaker implements IPostDBLoadMod 
{
    private logger: VerboseLogger;
    private applicator: Applicator;

    public postDBLoad(container: DependencyContainer): void 
    {
        this.logger = new VerboseLogger(container);
        this.applicator = new Applicator(this.logger);

        this.logger.explicitLog("Item Tweaker: Starting...", LogTextColor.BLACK, LogBackgroundColor.WHITE);

        this.logger.info("Initialization...");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        const dbItems: IDatabaseTables = tables.templates.items;

        // Collect selectors meta to check for intersections
        const selectorMetaData = {};
        for (const selectorKey in dynamicSelectors)
        {
            const selector: Selector = dynamicSelectors[selectorKey];
            const filterProperty = selector.filterProperty;
            const filterValues = selector.filterValues;

            // Make sure that user's selector has a proper JSON structure
            if (filterProperty != null && filterValues != null)
            {
                // Collecting matching IDs by simply applying the selector filter is not very precise.
                // Right now some IDs count as a match even if no properties are changed in them.
                // TODO: Collect matching IDs by trying to apply PROPERTIES, is applicable - count them as a match.
                const matchingItemIds = Object.keys(dbItems).filter(key => 
                {
                    const filterByPrivateProp: boolean = this.isPrivateProperty(filterProperty);
                    const filterValue = filterByPrivateProp ? dbItems[key][filterProperty] : dbItems[key]._props[filterProperty];
                    return filterValue != null && filterValues.includes(filterValue);
                });
            
                if (matchingItemIds.length > 0) 
                {
                    selectorMetaData[selectorKey] = {
                        matchingIds: matchingItemIds,
                        changedProperties: Object.keys(selector.multiply ?? {}).concat(Object.keys(selector.set ?? {})),
                        //Potentially priority number can be used to resolve conflicts
                        //though I can't see right now how conflicts could prevent you 
                        //from doing what you want to do in a meaningful way
                        priority: selector.priority
                    };
                }
                else 
                    this.logger.explicitWarning(`[WARNING] "${selectorKey}" has no matches. Check if "filterProperty"(${selector.filterProperty}) and "filterValues"(${selector.filterValues.toString().replace(/,/g, ", ")}) are correct.`);
            }
            else
                this.logger.explicitError(`[ERROR] "${selectorKey}" properties "filterProperty"(${filterProperty}) and "filterValues"(${filterValues}) have to be defined!`);
        }

        // Collect overwrite meta
        // And check if the names can be found in database
        const overwriteMetaData = {};
        for (const itemName in manualOverwrite)
        {
            const overwrite: Overwrite = manualOverwrite[itemName];
            const itemId = Object.keys(dbItems).find(element => dbItems[element]._name === itemName);
            if (itemId != null)
            {
                overwriteMetaData[itemId] = {
                    name: itemName,
                    changedProperties: Object.keys(overwrite.multiply ?? {}).concat(Object.keys(overwrite.set ?? {}))
                };
            }
            else 
            {
                this.logger.explicitWarning(`[WARNING] "${itemName}" couldn't be found in the database. Check if the name is correct, remember to refer to "_name", not "Name".`);
            }
        }

        // Check if selectors modify the same properties for the same items
        // and inform the user of potentially unexpected changes.
        // TODO: Maybe implement Record<string(itemId), string[](affectedProperties)> utility type to check each item individually, though it's not that necessary
        const checkedSelectors = [];
        for (const selectorKey in selectorMetaData)
        {
            const selectorChanges = selectorMetaData[selectorKey];
            for (const key in selectorMetaData)
            {
                if (selectorKey != key && !checkedSelectors.includes(key))
                {
                    const idIntersection: string[] = selectorChanges.matchingIds.filter(element => selectorMetaData[key].matchingIds.includes(element));
                    const propsIntersections: string[] = selectorChanges.changedProperties.filter(element => selectorMetaData[key].changedProperties.includes(element));
                    if (idIntersection.length > 0 && propsIntersections.length > 0)
                    {
                        this.logger.explicitLog(`[WARNING] Potentially unexpected changes. Selector "${selectorKey}" intersects with "${key}" in ${idIntersection.length} items.`, LogTextColor.RED, LogBackgroundColor.YELLOW);
                        
                        for (const itemId in overwriteMetaData)
                        {
                            const overwriteItem = overwriteMetaData[itemId];
                            // Check if item is resolved
                            if (idIntersection.includes(itemId)) 
                            {
                                const unresolvedProps = propsIntersections.filter(element => !overwriteItem.changedProperties.includes(element));
                                if (unresolvedProps.length > 0)
                                {
                                    this.logger.explicitLog(`[WARNING] Item ${overwriteItem.name} (${itemId}) is found in manual overwrite, but following property conflicts are not resolved: ${unresolvedProps.toString().replace(/,/g, ", ")}`, LogTextColor.BLACK, LogBackgroundColor.YELLOW);
                                }
                                idIntersection.splice(idIntersection.indexOf(itemId), 1);
                            }                            
                        }

                        const itemNames = idIntersection.map(element => dbItems[element]._name);
                        this.logger.explicitLog(`[WARNING] Conflict Items: ${itemNames.toString().replace(/,/g, ", ")}`, LogTextColor.YELLOW, LogBackgroundColor.BLACK);
                        this.logger.explicitLog(`[WARNING] Conflict Properties: ${propsIntersections.toString().replace(/,/g, ", ")}`, LogTextColor.YELLOW, LogBackgroundColor.BLACK);
                    }
                }
            }
            checkedSelectors.push(selectorKey);
        }

        // Apply Selector Tweaks
        // Use selectorMetaData to loop through, as it skips invalid selectors (no matches or errors in JSON structure)
        // If there are no valid selectors - do nothing
        if (Object.keys(selectorMetaData).length > 0)
        {
            this.logger.explicitInfo("Applying Selector Tweaks");

            for (const selectorKey in selectorMetaData)
            {
                const selector: Selector = dynamicSelectors[selectorKey];
                const filterProperty = selector.filterProperty;
                const filterValues = selector.filterValues;

                let changeCount = 0;
                let multipliedItemIds: string[] = [];
                let setItemIds: string[] = [];

                const ignoreOvewriteIds = Object.keys(overwriteMetaData);
                if (selector.multiply != null)
                {
                    this.logger.log(`Applying "${selectorKey}" multipliers`, LogTextColor.BLUE, LogBackgroundColor.BLACK);
                    const multiplierApplicator = this.applicator.tryToApplyAllMultipliers.bind(this.applicator);
                    const tweakResult = this.applyItemChanges(dbItems, selector.multiply, filterProperty, filterValues, multiplierApplicator, ignoreOvewriteIds);
                    changeCount += tweakResult.changeCount;
                    multipliedItemIds = tweakResult.changedItemIds;
                }
                if (selector.set != null)
                {
                    this.logger.log(`Applying "${selectorKey}" set values`, LogTextColor.BLUE, LogBackgroundColor.BLACK);
                    const valueApplicator = this.applicator.tryToApplyAllValues.bind(this.applicator);
                    const tweakResult = this.applyItemChanges(dbItems, selector.set, filterProperty, filterValues, valueApplicator, ignoreOvewriteIds);
                    changeCount += tweakResult.changeCount;
                    setItemIds = tweakResult.changedItemIds;
                }

                const changedItemCount = new Set<string>(multipliedItemIds.concat(setItemIds)).size;
                this.logger.explicitInfo(`"${selectorKey}" made ${changeCount} changes to ${changedItemCount} items`);
            }
        }
        
        // Apply Manual Overwrite Tweaks
        // Use overwriteMetaData to loop through, as it skips items which were not found (potentially due to a wrong name defined in the config)
        // If there are no valid overwrite items - do nothing
        if (Object.keys(overwriteMetaData).length > 0)
        {
            this.logger.explicitInfo("Applying Manual Overwrite Tweaks");

            for (const itemId in overwriteMetaData)
            {
                const itemName = overwriteMetaData[itemId].name;
                const overwrite = manualOverwrite[itemName];

                let changeCount = 0;
                if (overwrite.multiply != null)
                {
                    this.logger.log(`Applying "${itemName}" overwrite multipliers`, LogTextColor.BLUE, LogBackgroundColor.BLACK);
                    const multiplierApplicator = this.applicator.tryToApplyAllMultipliers.bind(this.applicator);
                    changeCount += this.applyItemChanges(dbItems, overwrite.multiply, "_id", [itemId], multiplierApplicator)[0];
                }
                if (overwrite.set != null)
                {
                    this.logger.log(`Applying "${itemName}" overwrite set values`, LogTextColor.BLUE, LogBackgroundColor.BLACK);
                    const valueApplicator = this.applicator.tryToApplyAllValues.bind(this.applicator);
                    changeCount += this.applyItemChanges(dbItems, overwrite.set, "_id", [itemId], valueApplicator)[0];
                }
                if (changeCount > 0)
                    this.logger.explicitInfo(`Manual Overwrite made ${changeCount} changes to "${itemName}"`);
            }
        }

        this.logger.explicitLog("Item Tweaker: Completed", LogTextColor.BLACK, LogBackgroundColor.WHITE);
    }

    /**
     * @param dbItems Database tables of the server which contain items.
     * @param sourceObj JSON source from which multipliers are taken.
     * @param filterProperty Property name in 'item' or 'item._props' by which you filter the items in database. The underscore determines whether to search inside "_props" or outside. Check aki database files or "https://db.sp-tarkov.com/" for reference.
     * @param applicatorFunc Requires an applicator function which will apply ALL changes from one object to another (Not singular functions like: tryToApplyValue or tryToApplyMultiplier). There are two types of these - value and multiplier functions.
     * @param ignoreIds Array of item IDs to ignore. Initially designed to preserve "manual_overwrite.JSON" priority and resolve conflicts if there are any.
     * @param validatorFunc Optional, if the default 'isValidItem' validator is not enough.
     * @returns An object with the operation result: change count, changed item count, array of changed item IDs
     */
    // In applicatorFunc specification leave logFormat as required parameter to incentivize the use of ApplicatorLogFormat.LIST_ENTRY.
    private applyItemChanges(dbItems: IDatabaseTables, sourceObj: any, filterProperty: string, filterValues: any[], applicatorFunc: (targetObj: object, sourceObj: object, logFormat: ApplicatorLogFormat) => number, ignoreIds: string[] = [], validatorFunc: (item: any) => boolean = this.isValidItem): {changeCount: number, changedItemCount: number, changedItemIds: string[]}
    {
        let changeCounter = 0;
        let changedItemCounter = 0;
        const changedItemIds: string[] = [];

        for (const key in dbItems) 
        {
            const id = key;
            // ignoreIds is used to ignore items which are present in "manual_overwrite.JSON" to preserve their priority
            if (!ignoreIds.includes(id))
            {
                const item = dbItems[key];
                const properties = item._props;
                const name = item._name;
            
                const filterByPrivateProp: boolean = this.isPrivateProperty(filterProperty);
                const filterValue = filterByPrivateProp ? item[filterProperty] : properties[filterProperty];
                // If we filter not by name then show the filter value in the header along with the name and id
                // There are several names in the item object, check for both '_name' and 'Name'
                // The '_name' private property is more accurate as there are incorrect names or dublicates set to '_props.Name'
                const filterValueHeader: string = name != filterValue && properties.Name != filterValue ? ` - ${filterProperty}: ${filterValue}` : "";

                if (validatorFunc(item))
                {
                // Check if item is present in source object(config)
                    if (filterValue != null && filterValues.includes(filterValue)) 
                    {
                        this.logger.log(`Item: ${name}${filterValueHeader} - id: ${id}`, LogTextColor.CYAN);
                        const result = applicatorFunc(properties, sourceObj, ApplicatorLogFormat.LIST_ENTRY);
                        if (result > 0)
                        {
                            changeCounter+= result;
                            ++changedItemCounter;
                            changedItemIds.push(id);
                        }                    
                    }
                }
            }
        }

        return {changeCount: changeCounter, changedItemCount: changedItemCounter, changedItemIds: changedItemIds};
    }

    // Item validation functions

    /**
     * Additional item validator for weapons, to really make sure it's a usable weapon in game.
     * @param item Item to validate.
     * @returns Validation result (true|false).
     */
    private isValidWeaponItem(item: any): boolean
    {
        return item != null && item._type === "Item" && item._props != null && item._props.weapClass != null && item._name != null;
    }

    /**
     * Additional item validator for armors, to really make sure it's a usable armor in game.
     * @param item Item to validate.
     * @returns Validation result. (true|false)
     */
    private isValidArmorItem(item: any): boolean
    {
        return item != null && item._type === "Item" && item._props != null && item._props.ArmorType != null && item._name != null;
    }

    /**
     * Basic item validator.
     * @param item Item to validate
     * @returns Validation result. (true|false)
     */
    private isValidItem(item: any): boolean
    {
        return item != null && item._type === "Item" && item._props != null && item._name != null;
    }
    
    /**
     * Primitive check to see where the property is private or not. Private properties are designated with an underscore.
     * @param propertyName String of a property name to be checked.
     * @returns Check result.
     */
    private isPrivateProperty(propertyName: string)
    {
        return propertyName.charAt(0) === "_";
    }
}

module.exports = { mod: new ItemTweaker() };