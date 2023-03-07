import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import { Aiming } from "@spt-aki/models/eft/common/IGlobals";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DependencyContainer } from "tsyringe";


// Mod Configs
import modConfig from "../config/config.json";
import weaponConfig from "../config/weaponConfig.json";
import armorConfig from "../config/armorConfig.json";

import { VerboseLogger } from "./verbose_logger";
import { Applicator } from "./applicator";

// Config Based Types
type GlobalMultipliers = typeof weaponConfig.multipliers.globals;
type WeaponClassMultipliers = typeof weaponConfig.multipliers.byWeaponClass;
type WeaponNameMultipliers = typeof weaponConfig.multipliers.byWeaponName;

type GlobalValues = typeof weaponConfig.manualOverwrite.globals;
type WeaponClassValues = typeof weaponConfig.manualOverwrite.byWeaponClass;
type WeaponNameValues = typeof weaponConfig.manualOverwrite.byWeaponName;

type ArmorTypeMultipliers = typeof armorConfig.multipliers.byArmorType;
type ArmorNameMultipliers = typeof armorConfig.multipliers.byArmorName;

type ArmorTypeValues = typeof armorConfig.manualOverwrite.byArmorType;
type ArmorNameValues = typeof armorConfig.manualOverwrite.byArmorName;

class RecoilTweaks implements IPostDBLoadMod 
{
    private logger: VerboseLogger;
    private applicator: Applicator;

    public postDBLoad(container: DependencyContainer): void 
    {
        // Init logger
        this.logger = new VerboseLogger(container);
        // Applicator tries to apply changes to db server configs
        this.applicator = new Applicator(this.logger);

        this.logger.explicitLog(" === [ Recoil Tweaks ] === ","black", "whiteBG");

        this.logger.info("Initialization...");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        const dbItems: IDatabaseTables = tables.templates.items;
        const globals: Aiming = tables.globals.config.Aiming;

        // WEAPON TWEAKS
        this.logger.info("a. Weapon tweaks started...");
        let totalChanges = 0;
        let itemsChanged = 0;

        const weaponMultiplyResult = this.applyWeaponMultipliers(dbItems, globals, 1);
        if (weaponMultiplyResult != -1) 
        {
            this.logger.explicitSuccess(`a. Successfully applied the multipliers. Made ${weaponMultiplyResult[0]} changes in total.`);
            totalChanges += weaponMultiplyResult[0];
            itemsChanged += weaponMultiplyResult[1];
        }
        else 
            this.logger.explicitError("a. Something went wrong while applying multipliers.");

        const weaponOverwriteResult = this.applyWeaponValues(dbItems, globals, 2);
        if (weaponMultiplyResult != -1) 
        {
            this.logger.explicitSuccess(`a. Successfully overwrote values. Made ${weaponOverwriteResult[0]} changes in total.`);
            totalChanges += weaponOverwriteResult[0];
            itemsChanged += weaponOverwriteResult[1];
        }
        else 
            this.logger.explicitError("a. Something went wrong while overwriting values.");


        // ARMOUR TWEAKS
        this.logger.info("b. Armor tweaks started...");

        const armorMultiplyResult = this.applyArmorMultipliers(dbItems, 1);
        if (armorMultiplyResult != -1) 
        {
            this.logger.explicitSuccess(`b. Successfully applied the multipliers. Made ${armorMultiplyResult[0]} changes in total.`);
            totalChanges += armorMultiplyResult[0];
            itemsChanged += armorMultiplyResult[1];
        }
        else 
            this.logger.explicitError("b. Something went wrong while applying multipliers.");

        const armorOverwriteResult = this.applyArmorValues(dbItems, 2);
        if (armorMultiplyResult != -1) 
        {
            this.logger.explicitSuccess(`b. Successfully overwrote values. Made ${armorOverwriteResult[0]} changes in total.`);
            totalChanges += armorOverwriteResult[0];
            itemsChanged += armorOverwriteResult[1];
        }
        else 
            this.logger.explicitError("a. Something went wrong while overwriting values.");

        // let fileData = dbItems[file];
        // if (fileData._props.weapClass === "pistol") {
        //     fileData._props.CameraRecoil = (fileData._props.CameraRecoil * config.pistolRecoil.PistCameraRecoil).toFixed(3);
        //     fileData._props.CameraSnap = (fileData._props.CameraSnap * config.pistolRecoil.PistCameraSnap).toFixed(3);
        //     fileData._props.RecoilForceUp = (fileData._props.RecoilForceUp * config.pistolRecoil.PistVertRec).toFixed(3);
        //     fileData._props.RecoilForceBack = (fileData._props.RecoilForceBack * config.pistolRecoil.PistHoriRec).toFixed(3);
        //     fileData._props.Convergence = (fileData._props.Convergence * config.pistolRecoil.PistConvergence).toFixed(2);
        //     fileData._props.RecolDispersion = (fileData._props.RecolDispersion * config.pistolRecoil.PistDispersion).toFixed(0);
        //     counter++;
        this.logger.explicitInfo(`Made ${totalChanges} changes in total. Changed ${itemsChanged} items.`);
        this.logger.explicitLog(" === COMPLETED === ", "black", "whiteBG");
    }

    private applyWeaponMultipliers(dbItems, globals, actionOrder: number): [number, number] | number
    {
        const globalMults: GlobalMultipliers = weaponConfig.multipliers.globals;
        // A bound applicator function to pass down to 'this.applyItemChanges'
        const applicator = this.applicator.tryToApplyAllItemMultipliers.bind(this.applicator);
        this.logger.info(`${actionOrder}. Applying Weapon Multipliers...`);

        // GLOBAL PARAMS
        this.logger.info(`${actionOrder}.1 Global Parameters;`);
        // Check if RecoilCrank is in the multipliers section
        // A pretty specific check but i suppose it should be left here for now
        if ("RecoilCrank" in globalMults) 
        {
            this.logger.explicitError("[Error] Recoil crank is boolean and can't be multiplied. Remove it from the multipliers section in the config.");
            return -1;
        }
        let globalsChangeCount = 0;
        globalsChangeCount += this.applicator.tryToApplyAllMultipliers(globals, globalMults);
        this.logger.info(`Successfully changed ${globalsChangeCount} global parameters.`)

        // BY WEAPON CLASS
        this.logger.info(`${actionOrder}.2 By Weapon Class;`);
        const weapClassMults: WeaponClassMultipliers = weaponConfig.multipliers.byWeaponClass;
        const [byClassChangeCount, byClassWeaponCount] = this.applyItemChanges(dbItems, weapClassMults, "weapClass", applicator);
        this.logger.info(`Successfully changed ${byClassChangeCount} weapon attributes for ${byClassWeaponCount} weapons based on 'weapClass'`);

        // BY WEAPON NAME
        this.logger.info(`${actionOrder}.3 By Weapon Name;`);
        const weapNameMults: WeaponNameMultipliers = weaponConfig.multipliers.byWeaponName;
        const [byNameChangeCount, byNameWeaponCount] = this.applyItemChanges(dbItems, weapNameMults, "_name", applicator);
        this.logger.info(`Successfully changed ${byNameChangeCount} weapon attributes for ${byNameWeaponCount} weapons based on '_name'`);

        return [globalsChangeCount + byClassChangeCount + byNameChangeCount, byClassWeaponCount+ byNameWeaponCount];
    }

    private applyWeaponValues(dbItems, globals, actionOrder: number): [number, number] | number
    {
        const globalValues: GlobalValues = weaponConfig.manualOverwrite.globals;
        // A bound applicator function to pass down to 'this.applyItemChanges'
        const applicator = this.applicator.tryToApplyAllItemValues.bind(this.applicator);
        this.logger.info(`${actionOrder}. Applying Weapon Values...`);

        // GLOBAL PARAMS
        this.logger.info(`${actionOrder}.1 Global Parameters;`);
        // Check if RecoilCrank is in the multipliers section
        // A pretty specific check but i suppose it should be left here for now
        if ("RecoilCrank" in globalValues)
        {
            if (typeof globalValues.RecoilCrank != "boolean")
            {
                this.logger.explicitError("[Error] Recoil crank has to be boolean.");
                return -1;
            }
        }
        let globalsChangeCount = 0;
        globalsChangeCount += this.applicator.tryToApplyAllMultipliers(globals, globalValues);
        this.logger.info(`Successfully changed ${globalsChangeCount} global parameters.`);

        // BY WEAPON CLASS
        this.logger.info(`${actionOrder}.2 By Weapon Class;`);
        const weapClassValues: WeaponClassValues = weaponConfig.manualOverwrite.byWeaponClass;
        const [byClassChangeCount, byClassWeaponCount] = this.applyItemChanges(dbItems, weapClassValues, "weapClass", applicator);
        this.logger.info(`Successfully changed ${byClassChangeCount} weapon attributes for ${byClassWeaponCount} weapons based on 'weapClass'`);

        // BY WEAPON NAME
        this.logger.info(`${actionOrder}.3 By Weapon Name;`);
        const weapNameValues: WeaponNameValues = weaponConfig.manualOverwrite.byWeaponName;
        const [byNameChangeCount, byNameWeaponCount] = this.applyItemChanges(dbItems, weapNameValues, "_name", applicator);
        this.logger.info(`Successfully changed ${byNameChangeCount} weapon attributes for ${byNameWeaponCount} weapons based on '_name'`);

        return [globalsChangeCount + byClassChangeCount + byNameChangeCount, byClassWeaponCount + byNameWeaponCount];
    }

    private applyArmorMultipliers(dbItems, actionOrder: number): [number, number] | number
    {
        // A bound applicator function to pass down to 'this.applyItemChanges'
        const applicator = this.applicator.tryToApplyAllItemMultipliers.bind(this.applicator);
        this.logger.info(`${actionOrder}. Applying Amour Multipliers...`);

        // BY ARMOR TYPE
        this.logger.info(`${actionOrder}.1 By Armor Type`);
        const armorClassMults: ArmorTypeMultipliers = armorConfig.multipliers.byArmorType;
        const [byTypeChangeCount, byTypeArmorCount] = this.applyItemChanges(dbItems, armorClassMults, "ArmorType", applicator);
        this.logger.info(`Successfully changed ${byTypeChangeCount} armor attributes for ${byTypeArmorCount} armors based on 'ArmorType'`);

        // BY ARMOUR NAME
        this.logger.info(`${actionOrder}.2 By Armor Name`);
        const armorNameMults: ArmorNameMultipliers = armorConfig.multipliers.byArmorName;
        const [byNameChangeCount, byNameArmorCount] = this.applyItemChanges(dbItems, armorNameMults, "_name", applicator);
        this.logger.info(`Successfully changed ${byNameChangeCount} armor attributes for ${byNameArmorCount} armors based on '_name'`);

        return [byTypeChangeCount + byNameChangeCount, byTypeArmorCount + byNameArmorCount];
    }

    private applyArmorValues(dbItems, actionOrder: number): [number, number] | number
    {
        // A bound applicator function to pass down to 'this.applyItemChanges'
        const applicator = this.applicator.tryToApplyAllItemValues.bind(this.applicator);
        this.logger.info(`${actionOrder}. Applying Armor Values...`);

        // BY ARMOR TYPE
        this.logger.info(`${actionOrder}.1 By Armor Type`);
        const armorClassValues: ArmorNameValues = armorConfig.manualOverwrite.byArmorType;
        const [byTypeChangeCount, byTypeArmorCount] = this.applyItemChanges(dbItems, armorClassValues, "ArmorType", applicator);
        this.logger.info(`Successfully changed ${byTypeChangeCount} armor attributes for ${byTypeArmorCount} armors based on 'ArmorType'`);

        // BY ARMOUR NAME
        this.logger.info(`${actionOrder}.2 By Armor Name`);
        const armorNameValues: ArmorNameValues = armorConfig.manualOverwrite.byArmorName;
        const [byNameChangeCount, byNameArmorCount] = this.applyItemChanges(dbItems, armorNameValues, "_name", applicator);
        this.logger.info(`Successfully changed ${byNameChangeCount} armor attributes for ${byNameArmorCount} armors based on '_name'`);

        return [byTypeChangeCount + byNameChangeCount, byTypeArmorCount + byNameArmorCount];
    }

    /**
     * dbItems - database tables of the server which contain items
     * sourceObj - json source from which multipliers are taken
     * filterProperty - 'item' or 'item._props' property name by which you filter the items in database. The underscore determines whether to search inside _props or outside
     * applicatorFunc - applicator function which will apply all changes. There are two types of these - value and multiplier functions. (Not singular functions e.g.: tryToApplyValue or tryToApplyMultiplier)
     * validatorFunc? - optional, if the default 'isValidItem' validator is not enough
     * returns - array with counters, first - total change counter, second - how many items were changed
     */
    private applyItemChanges(dbItems: IDatabaseTables, sourceObj: any, filterProperty: string, applicatorFunc: (targetObj: any, sourceObj:any) => number, validatorFunc: (item: any) => boolean = this.isValidItem): [number, number]
    {
        let changeCounter = 0;
        let changedItemCounter = 0;

        for (const key in dbItems) 
        {
            const id = key;
            const item = dbItems[key];
            const properties = item._props;
            const name = item._name;
            
            const filterByPrivateProp: boolean = this.isPrivateProperty(filterProperty);
            const filterValue = filterByPrivateProp ? item[filterProperty] : properties[filterProperty];
            // If we filter not by name then show the filter value in the header along with the name and id
            // There are several names in the item object, check for both '_name' and 'Name'
            // The '_name' private property is more accurate as there are incorrect names or dublicates set to '_props.Name'
            const filterValueHeader: string = name != filterValue && properties.Name != filterValue ? ` - ${filterValue}` : "";

            if (validatorFunc(item))
            {
                // Check if item is present in source object(config)
                if (filterValue != null && filterValue in sourceObj) 
                {
                    this.logger.log(`Item: ${name}${filterValueHeader} - ${id}`, "cyan");
                    const result = applicatorFunc(properties, sourceObj[filterValue]);
                    if (result > 0)
                    {
                        changeCounter+= result;
                        ++changedItemCounter;
                    }                    
                }
            }

        }

        return [changeCounter, changedItemCounter];
    }

    // Item validation functions

    private isValidWeaponItem(item: any): boolean
    {
        return item != null && item._type === "Item" && item._props != null && item._props.weapClass != null && item._name != null;
    }

    private isValidArmorItem(item: any): boolean
    {
        return item != null && item._type === "Item" && item._props != null && item._props.ArmorType != null && item._name != null;
    }

    private isValidItem(item: any): boolean
    {
        return item != null && item._type === "Item" && item._props != null && item._name != null;
    }
    
    private isPrivateProperty(propertyName: string)
    {
        return propertyName.charAt(0) === "_";
    }
}

module.exports = { mod: new RecoilTweaks() };