import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DependencyContainer } from "tsyringe";

import dynamicSelectors from "../config/dynamic_selectors.json";
import manualOverwrite from "../config/manual_overwrite.json";

import { VerboseLogger } from "./verbose_logger";
import { Applicator, ApplicatorChangeType, ApplicatorLogFormat } from "./applicator";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { LogBackgroundColor } from "@spt-aki/models/spt/logging/LogBackgroundColor";
import { Expression, Query } from "./query";



type Selector = {
    query: Expression,
    multiply?: object;
    set?: object;
    priority?: number;
}

type SelectorMetaData = {
    matchingIds: string[];
    changedProperties: string[];
    priority?: number;
    isValid: boolean;
}

type Overwrite = {
    multiply?: object;
    set?: object;
}

type OverwriteMetaData = {
    name: string;
    changedProperties: string[];
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

        this.logger.explicitInfo("Initialization...");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        const dbItems: IDatabaseTables = tables.templates.items;

        // Collect selectors meta to check for intersections and validate selectors
        const selectorsMetaData = new Map<string, SelectorMetaData>();
        for (const selectorKey in dynamicSelectors)
        {
            selectorsMetaData.set(selectorKey, this.getSelectorMetaData(dbItems, dynamicSelectors[selectorKey], selectorKey));
        }
        // Collect overwrite meta
        // And check if the names can be found in database
        const overwritesMetaData = new Map<string, OverwriteMetaData>();
        for (const itemName in manualOverwrite)
        {
            const overwrite: Overwrite = manualOverwrite[itemName];
            const itemId = Object.keys(dbItems).find(element => dbItems[element]._name === itemName);
            if (itemId != null)
            {
                overwritesMetaData.set(itemId, {
                    name: itemName,
                    changedProperties: Object.keys(overwrite.multiply ?? {}).concat(Object.keys(overwrite.set ?? {}))
                });
            }
            else 
            {
                this.logger.explicitWarning(`[WARNING] "${itemName}" couldn't be found in the database. Check if the name is correct, remember to refer to "_name", not "Name".`);
            }
        }

        // Check if selectors modify the same properties for the same items
        // and inform the user of potentially unexpected changes.
        // TODO: Maybe implement Record<string(itemId), string[](affectedProperties)> utility type to check each item individually, though it's not that necessary at all
        const checkedSelectors: string[] = [];
        for (const selectorKey of selectorsMetaData.keys())
        {
            const selectorChanges = selectorsMetaData.get(selectorKey);
            for (const key of selectorsMetaData.keys())
            {
                if (selectorKey != key && !checkedSelectors.includes(key))
                {
                    const otherSelectorChanges = selectorsMetaData.get(key);
                    const idIntersection: string[] = selectorChanges.matchingIds.filter(element => otherSelectorChanges.matchingIds.includes(element));
                    const propsIntersections: string[] = selectorChanges.changedProperties.filter(element => otherSelectorChanges.changedProperties.includes(element));
                    if (idIntersection.length > 0 && propsIntersections.length > 0)
                    {
                        this.logger.explicitLog(`[WARNING] Potentially unexpected changes. Selector "${selectorKey}" intersects with "${key}" in ${idIntersection.length} items.`, LogTextColor.RED, LogBackgroundColor.YELLOW);
                        
                        for (const itemId of overwritesMetaData.keys())
                        {
                            const overwriteMeta = overwritesMetaData.get(itemId);
                            // Check if item is resolved
                            if (idIntersection.includes(itemId)) 
                            {
                                const unresolvedProps = propsIntersections.filter(element => !overwriteMeta.changedProperties.includes(element));
                                if (unresolvedProps.length > 0)
                                {
                                    this.logger.explicitLog(`[WARNING] Item ${overwriteMeta.name} (${itemId}) is found in manual overwrite, but following property conflicts are not resolved: ${unresolvedProps.toString().replace(/,/g, ", ")}`, LogTextColor.BLACK, LogBackgroundColor.YELLOW);
                                }
                                idIntersection.splice(idIntersection.indexOf(itemId), 1);
                            }                            
                        }

                        const itemNames = idIntersection.map(element => dbItems[element]._name);
                        this.logger.explicitLog(`[WARNING] Conflict Items: ${itemNames.toString().replace(/,/g, ", ")}`, LogTextColor.YELLOW);
                        this.logger.explicitLog(`[WARNING] Conflict Properties: ${propsIntersections.toString().replace(/,/g, ", ")}`, LogTextColor.YELLOW);
                    }
                }
            }
            checkedSelectors.push(selectorKey);
        }

        // Apply Selector Tweaks
        // Use selectorMetaData to loop through, as it skips invalid selectors (no matches or errors in JSON structure)
        // If there are no valid selectors - do nothing
        if (selectorsMetaData.size > 0)
        {
            this.logger.explicitInfo("Applying Selector Tweaks...");

            for (const selectorKey of selectorsMetaData.keys())
            {
                const selectorMeta = selectorsMetaData.get(selectorKey);
                if (selectorMeta.isValid)
                {
                    const selector: Selector = dynamicSelectors[selectorKey];
                    const ignoreOvewriteIds = [...overwritesMetaData.keys()];

                    this.logger.log(`Applying "${selectorKey}"...`, LogTextColor.BLUE);
                    const tweakResult = this.applySelector(dbItems, selector, selectorMeta.matchingIds, ignoreOvewriteIds);

                    this.logger.explicitInfo(`"${selectorKey}" made ${tweakResult.changeCount} changes to ${tweakResult.changedItemCount} items`);
                }
            }
        }
        
        // Apply Manual Overwrite Tweaks
        // Use overwriteMetaData to loop through, as it skips items which were not found (potentially due to a wrong name defined in the config)
        // If there are no valid overwrite items - do nothing
        if (overwritesMetaData.size > 0)
        {
            this.logger.explicitInfo("Applying Manual Overwrite Tweaks...");

            for (const itemId of overwritesMetaData.keys())
            {
                const itemName = overwritesMetaData.get(itemId).name;
                const overwriteSelector: Selector = {
                    query: {
                        key: "_id",
                        operation: "equals",
                        values: [itemId]
                    },
                    multiply: manualOverwrite[itemName],
                    set: manualOverwrite[itemName]
                }
                this.logger.log(`Applying "${itemName}" overwrite...`, LogTextColor.BLUE);
                const overwriteResult = this.applySelector(dbItems, overwriteSelector, [itemId]);
                this.logger.explicitInfo(`Manual Overwrite made ${overwriteResult.changeCount} changes to "${itemName}"`);
            }
        }

        this.logger.explicitLog("Item Tweaker: Completed", LogTextColor.BLACK, LogBackgroundColor.WHITE);
    }

    /**
     * Applies a selector to database items.
     * @param dbItems Database tables of the server which contain items.
     * @param selector A selector that will be applied.
     * @param affectedItemIds An optional array of item IDs which should be affected by this selector. Intended as optimization to use with SelectorMetaData.matchingIds or when changing one item only.
     * @param ignoreIds An optional array of item IDs to ignore. Initially designed to preserve "manual_overwrite.JSON" priority and resolve conflicts if there are any.
     * @param validatorFunc Optional, if the default 'isValidItem' validator is not enough.
     * @returns An object with the operation result: change count, changed item count, array of changed item IDs
     */
    // In applicatorFunc specification leave logFormat as required parameter to incentivize the use of ApplicatorLogFormat.LIST_ENTRY.
    private applySelector(dbItems: IDatabaseTables, selector: Selector, affectedItemIds: string[] = [], ignoreIds: string[] = [], validatorFunc: (item: any) => boolean = this.isValidItem): {changeCount: number, changedItemCount: number, changedItemIds: string[]}
    {
        let changeCount = 0;
        let changedItemCount = 0;
        const changedItemIds: string[] = [];

        // const filterProperty = selector.filterProperty;
        // const filterValues = selector.filterValues;
        // const filterByPrivateProp: boolean = this.isPrivateProperty(filterProperty);

        // Not really needed but can help avoid needless iterations over the database
        const itemIdSource = affectedItemIds.length > 0 ? affectedItemIds : Object.keys(dbItems);
        for (const id of itemIdSource) 
        {
            // ignoreIds is used to ignore items which are present in "manual_overwrite.JSON" to preserve their priority
            if (!ignoreIds.includes(id))
            {
                const item = dbItems[id];
                const properties = item._props;
                const name = item._name;
            
                // const filterValue = filterByPrivateProp ? item[filterProperty] : properties[filterProperty];
                // If we filter not by name then show the filter value in the header along with the name and id
                // There are several names in the item object, check for both '_name' and 'Name'
                // The '_name' private property is more accurate as there are incorrect names or dublicates set to '_props.Name'
                // const filterValueHeader: string = name != filterValue && properties.Name != filterValue ? ` - ${filterProperty}: ${filterValue}` : "";
                /**
                 * @deprecated Legacy constant. Eqauls to "" since the implementation of query trees.
                 */
                const filterValueHeader = "";

                if (validatorFunc(item))
                {
                    // Check if item matches the selector
                    // if (filterValue != null && filterValues.includes(filterValue)) 
                    if (Query.evaluateQuery(selector.query, item)) 
                    {
                        if (selector.multiply != null || selector.set != null)
                        {
                            this.logger.log(`Item: ${name}${filterValueHeader} - id: ${id}`, LogTextColor.CYAN);
                            let multiplyResult = 0;
                            let setValueResult = 0;

                            if (selector.multiply != null)
                                multiplyResult += this.applicator.tryToApplyAllChanges(properties, selector.multiply, ApplicatorChangeType.MULTIPLY, ApplicatorLogFormat.LIST_ENTRY);
                            if (selector.set != null)
                                setValueResult += this.applicator.tryToApplyAllChanges(properties, selector.set, ApplicatorChangeType.SET_VALUE, ApplicatorLogFormat.LIST_ENTRY);

                            const totalResult = multiplyResult+setValueResult;
                            if (totalResult > 0)
                            {
                                changeCount+= totalResult;
                                ++changedItemCount;
                                changedItemIds.push(id);
                            }
                        }
                    }
                }
            }
        }
        return {changeCount: changeCount, changedItemCount: changedItemCount, changedItemIds: changedItemIds};
    }

    /**
     * Get an array of items which the selector affects. That means items which match filter properties and contain a valid property that can be changed by the selector.
     * @param dbItems Database tables of the server which contain items.
     * @param selector A selector that will be applied.
     * @param validatorFunc Optional, if the default 'isValidItem' validator is not enough.
     * @returns An object with the operation result: change count, changed item count, array of changed item IDs
     */
    private getAffectedItemIds(dbItems: IDatabaseTables, selector: Selector, validatorFunc: (item: any) => boolean = this.isValidItem): string[]
    {
        const affectedItemIds: string[] = [];
        // const filterProperty = selector.filterProperty;
        // const filterValues = selector.filterValues;
        for (const id in dbItems) 
        {
            const item = dbItems[id];
            const properties = item._props;           
            // const filterByPrivateProp: boolean = this.isPrivateProperty(filterProperty);
            // const filterValue = filterByPrivateProp ? item[filterProperty] : properties[filterProperty];
            // There are several names in the item object, check for both '_name' and 'Name'
            // The '_name' private property is more accurate as there are incorrect names or dublicates set to '_props.Name'
            if (validatorFunc(item))
            {
                // Check if item matches the selector
                // if (filterValue != null && filterValues.includes(filterValue)) 
                if (Query.evaluateQuery(selector.query, item)) 
                {
                    if (selector.multiply != null || selector.set != null)
                    {
                        let isAffectedItem = false;
                        if (selector.multiply != null)
                            if (this.applicator.canApplyAnyChanges(properties, selector.multiply, ApplicatorChangeType.MULTIPLY)) isAffectedItem = true;
                        if (selector.set != null)
                            if (this.applicator.canApplyAnyChanges(properties, selector.set, ApplicatorChangeType.SET_VALUE)) isAffectedItem = true;
                        if (isAffectedItem)
                            affectedItemIds.push(id);
                    }
                }
            }
        }
        return affectedItemIds;
    }

    /**
     * Validates a selector and collects meta data for it.
     * @param dbItems Database tables of the server which contain items.
     * @param selector A selector to validate and collect meta data for.
     * @param validatorFunc Optional, if the default 'isValidItem' validator is not enough.
     * @returns A meta data object.
     */
    private getSelectorMetaData(dbItems: IDatabaseTables, selector: Selector, logName?: string): SelectorMetaData
    {
        const multiply = selector.multiply;
        const set = selector.set;

        // Make sure that user's selector has a proper JSON structure and types
        // if (filterProperty != null && filterValues != null && typeof filterProperty === "string" && Array.isArray(filterValues))
        if (Query.isQuery(selector.query))
        {
            // Selector having no changes is not critical
            if (multiply === undefined && set === undefined)
            {
                if (logName !== undefined)
                    this.logger.explicitWarning(`[WARNING] "${logName}" does nothing. Both it's "multiply" and "set" properties are undefined.`);
            }
            // Make sure "multiply" and "set" properties are objects. Remember that being "undefined" is allowed.
            if (multiply === null || (multiply != null && multiply.constructor.name !== "Object") || set === null || (set != null && set.constructor.name !== "Object"))
            {
                if (logName !== undefined)
                    this.logger.explicitError(`[ERROR] "${logName}" properties "multiply"(${JSON.stringify(multiply)}) and "set"(${JSON.stringify(set)}) must be objects!`);
            }
            else 
            {
                const matchingItemIds = this.getAffectedItemIds(dbItems, selector);
                if (matchingItemIds.length < 1 && (multiply !== undefined || set !== undefined)) // Check for undefined multiply/set propertis to avoid duplicating basically the same message. 
                    if (logName !== undefined)
                        this.logger.explicitWarning(`[WARNING] "${logName}" has no matches. Check your query parameters and if multiplied/set property names and value types are correct. For more info enable "verbose" in config.`);
                return {
                    matchingIds: matchingItemIds,
                    changedProperties: [...new Set(Object.keys(selector.multiply ?? {}).concat(Object.keys(selector.set ?? {})))],
                    //Potentially priority number can be used to resolve conflicts
                    //though I can't see right now how conflicts could prevent you 
                    //from doing what you want to do in a meaningful way
                    priority: selector.priority,
                    isValid: true
                };
            }
        }
        else
        {
            if (logName !== undefined)
                // this.logger.explicitError(`[ERROR] "${logName}" properties "filterProperty"(${JSON.stringify(filterProperty)}) and "filterValues"(${JSON.stringify(filterValues)}) have to be defined and must have a type "string" and "Array" accordingly!`);
                this.logger.explicitError(`[ERROR] "${logName}" query has wrong structure. Check if every expression in the tree has proper structure!`);
        }
        return {
            matchingIds: [],
            changedProperties: [],
            isValid: false
        }
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
     * @deprecated
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