import { VerboseLogger } from "./verbose_logger";

/**
 * To define a format in which to output the value/multiplier application log.
 */
enum ApplicatorLogFormat
    {
    LIST_ENTRY,
    DEFAULT
}

/**
 * Defines what applicator has to do with property values.
 */
enum ApplicatorChangeType
    {
    MULTIPLY,
    SET_VALUE
}


/**
 * Utility class which applies values and multipliers to target objects from source objects with different options.
 * As a rule returns a number of applied changes.
 * 
 * Requires a VerboseLogger to optionally output messages based on a config value.
 * 
 * Version 230315
 */
class Applicator 
{
    private logger: VerboseLogger;

    constructor(logger: VerboseLogger)
    {
        this.logger = logger;
    }

    /**
     * Checks if a value can be applied to the target object (without actually applying it).
     * @param targetObj Target object to apply the value to.
     * @param sourceObj Source object to get the value from.
     * @param parameter Property name.
     * @param showLogMessages Whether to show the warning/error messages during the checking process.
     * @returns Boolean check result.
     */
    public canApplyValue(targetObj: object, sourceObj: object, parameter: string, showLogMessages = false): boolean
    {
        // Nothing is written into target object so assign it's property a simpler variable name.
        try 
        {
            // const oldValue = targetObj[parameter];
            const oldValue = Applicator.getNestedProperty(targetObj, parameter);
            const newValue = sourceObj[parameter];
            if (oldValue !== undefined) 
            {
                if (typeof oldValue !== typeof newValue)
                {
                    if (showLogMessages)
                        this.logger.error(`[ERROR] "${parameter}": new value type "${typeof newValue}" doesn't match old value type "${typeof oldValue}"!`);
                    return false;
                }
            }
            else 
            {
                if (showLogMessages)
                    this.logger.warning(`[WARNING] "${parameter}" property is undefined in the target object.`);
                return false;
            }
            return true;
        }
        catch (error) 
        {
            if (showLogMessages)
                this.logger.error(`[ERROR] "${parameter}": ${error}`);
            return false;
        }
    }

    /**
     * Checks if a multiplier can be applied to the target object (without actually applying it).
     * @param targetObj Target object to apply the value to.
     * @param sourceObj Source object to get the value from.
     * @param parameter Property name.
     * @param showLogMessages Whether to show the warning/error messages during the checking process.
     * @returns Boolean check result.
     */
    public canApplyMultiplier(targetObj: object, sourceObj: object, parameter: string, showLogMessages = false): boolean 
    {
        try 
        {
        // Nothing is written into target object so assign it's property a simpler variable name.
        // const oldValue = targetObj[parameter];
            const oldValue = Applicator.getNestedProperty(targetObj, parameter);
            const multiplier = sourceObj[parameter];
            if (typeof multiplier !== "number" || Number.isNaN(multiplier))
            {
                if (showLogMessages)
                    this.logger.error(`[ERROR] "${parameter}" property multiplier has to be a number!`);
                return false;
            }
            if (oldValue !== undefined) 
            {
                if (typeof oldValue !== "number" || Number.isNaN(oldValue))
                {
                    if (showLogMessages)
                        this.logger.error(`[ERROR] Type of property "${parameter}" is ${typeof oldValue} and can't be multiplied!`);
                    return false;
                }
            }
            else 
            {
                if (showLogMessages)
                    this.logger.warning(`[WARNING] "${parameter}" property is undefined in the target object.`);
                return false;
            }
            return true;
        }
        catch (error) 
        {
            if (showLogMessages)
                this.logger.error(`[ERROR] "${parameter}": ${error}`);
            return false;
        }
    }

    /**
     * Checks if atleast one change can be applied to the target object.
     * @param targetObj Target object to apply the value to.
     * @param sourceObj Source object to get the value from.
     * @param changeType Change type enum.
     * @param showLogMessages Whether to show the warning/error messages during the checking process.
     * @returns Boolean check result.
     */
    public canApplyAnyChanges(targetObj: object, sourceObj: object, changeType: ApplicatorChangeType, showLogMessages = false): boolean
    {
        switch (changeType)
        {
            case ApplicatorChangeType.MULTIPLY:
                for (const parameter in sourceObj)
                    if (this.canApplyMultiplier(targetObj, sourceObj, parameter, showLogMessages)) return true;
                break;
            case ApplicatorChangeType.SET_VALUE:
                for (const parameter in sourceObj) 
                    if (this.canApplyValue(targetObj, sourceObj, parameter, showLogMessages)) return true;
                break;
            default:
                throw ("Undefined ApplicatorChangeType used.");
        }
        return false;
    }

    /**
     * A singular applicator function. Tries to apply a value from one object to another if possible. If successfull - will output an optional success message, if not - warning/error messages.
     * @param targetObj Target object to apply the value to.
     * @param sourceObj Source object to get the value from.
     * @param parameter Property name which should be applied.
     * @param logFormat A format in which to output the application log.
     * @returns Number of changes made. (1 or 0 due to it being a singular application function)
     */
    public tryToApplyValue(targetObj: object, sourceObj: object, parameter: string, logFormat: ApplicatorLogFormat = ApplicatorLogFormat.DEFAULT): number 
    {
        if (this.canApplyValue(targetObj, sourceObj, parameter, true))
        {
            const newValue = sourceObj[parameter];
            const oldValue = Applicator.getNestedProperty(targetObj, parameter);
            if (oldValue !== newValue)
            {
                // targetObj[parameter] = newValue;
                Applicator.setNestedProperty(targetObj, parameter, newValue);
                switch (logFormat)
                {
                    case ApplicatorLogFormat.LIST_ENTRY:
                        this.logger.success(`├ ${parameter}: Successfully applied value ${JSON.stringify(Applicator.getNestedProperty(targetObj, parameter))} (was ${JSON.stringify(oldValue)})`);
                        break;
                    default:
                        this.logger.success(`"${parameter}": Successfully applied value ${JSON.stringify(Applicator.getNestedProperty(targetObj, parameter))} (was ${JSON.stringify(oldValue)})`);
                        break;
                }
                return 1;
            }
            else 
            {
                switch (logFormat)
                {
                    case ApplicatorLogFormat.LIST_ENTRY:
                        this.logger.info(`├ ${parameter}: Default or identical value used (${JSON.stringify(oldValue)}). No changes applied.`);
                        break;
                    default:
                        this.logger.info(`"${parameter}": Default or identical value used (${JSON.stringify(oldValue)}). No changes applied.`);
                        break;
                }
            }
        }
        return 0;
    }

    /**
     * @deprecated Legacy function. Tries to apply all values from source object to the target object if possible. May output success, warning and error messages.
     * @param targetObj Target object to apply the value to.
     * @param sourceObj Source object to get the value from.
     * @param logFormat A format in which to output the application log.
     * @returns Number of changes made.
     */
    public tryToApplyAllValues(targetObj: object, sourceObj: object, logFormat: ApplicatorLogFormat = ApplicatorLogFormat.DEFAULT): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj) 
        {
            changeCounter += this.tryToApplyValue(targetObj, sourceObj, parameter, logFormat);
        }
        return changeCounter;
    }

    /**
     * A singular applicator function. Tries to apply a multiplier from one object to the property of another's if possible. If successfull - will output an optional success message, if not - warning/error messages.
     * @param targetObj Target object to apply the multiplier to.
     * @param sourceObj Source object to get the multiplier from.
     * @param parameter Property name which should be applied.
     * @param logFormat A format in which to output the application log.
     * @returns Number of changes made. (1 or 0 due to it being a singular application function)
     */
    public tryToApplyMultiplier(targetObj: object, sourceObj: object, parameter: string, logFormat: ApplicatorLogFormat = ApplicatorLogFormat.DEFAULT): number 
    {
        if (this.canApplyMultiplier(targetObj, sourceObj, parameter, true))
        {
            const multiplier = sourceObj[parameter];
            // const oldValue = targetObj[parameter];
            const oldValue = Applicator.getNestedProperty(targetObj, parameter);
            // targetObj[parameter] *= multiplier;
            Applicator.setNestedProperty(targetObj, parameter, oldValue * multiplier);
            // if (oldValue !== targetObj[parameter]) 
            if (oldValue !== Applicator.getNestedProperty(targetObj, parameter)) 
            {
                switch (logFormat)
                {
                    case ApplicatorLogFormat.LIST_ENTRY:
                    // Format string seems not that useful here at all, keep for reference or remove later.
                    // this.logger.success("├ %0s: Successfully multiplied by %0s (Before: %0s | After: %0s)", parameter, multiplier, oldValue, targetObj[parameter]);
                        this.logger.success(`├ ${parameter}: Successfully multiplied by ${multiplier} (Before: ${oldValue} | After: ${Applicator.getNestedProperty(targetObj, parameter)})`);
                        break;
                    default:
                        this.logger.success(`"${parameter}": Successfully multiplied by ${multiplier} (Before: ${oldValue} | After: ${Applicator.getNestedProperty(targetObj, parameter)})`);
                        break;
                }
                return 1;
            }
            else 
            {
                switch (logFormat)
                {
                    case ApplicatorLogFormat.LIST_ENTRY:
                        this.logger.info(`├ ${parameter}: New and old values are identical. No changes applied. (Current: ${oldValue})`);
                        break;
                    default:
                        this.logger.info(`"${parameter}": New and old values are identical. No changes applied. (Current: ${oldValue})`);
                        break;
                }
            }
        }
        return 0;
    }

    /**
     * @deprecated Legacy function. Tries to apply all multipliers from source object to the the properties of a target object if possible. May output success, warning and error messages.
     * @param targetObj Target object to apply the multiplier to.
     * @param sourceObj Source object to get the multiplier from.
     * @param logFormat A format in which to output the application log.
     * @returns Number of changes made.
     */
    public tryToApplyAllMultipliers(targetObj: object, sourceObj: object, logFormat: ApplicatorLogFormat = ApplicatorLogFormat.DEFAULT): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj) 
        {
            changeCounter += this.tryToApplyMultiplier(targetObj, sourceObj, parameter, logFormat);
        }
        return changeCounter;
    }

    /**
     * Tries to apply all changes from source object to the the properties of a target object if possible. May output success, warning and error messages.
     * @param targetObj Target object to apply the changes to.
     * @param sourceObj Source object to get the changes from.
     * @param changeType Change type enum.
     * @param logFormat A format in which to output the application log.
     * @returns Number of changes made.
     */
    public tryToApplyAllChanges(targetObj: object, sourceObj: object, changeType: ApplicatorChangeType, logFormat: ApplicatorLogFormat = ApplicatorLogFormat.DEFAULT): number 
    {
        let changeCounter = 0;
        switch (changeType)
        {
            case ApplicatorChangeType.MULTIPLY:
                for (const parameter in sourceObj) 
                    changeCounter += this.tryToApplyMultiplier(targetObj, sourceObj, parameter, logFormat);
                break;
            case ApplicatorChangeType.SET_VALUE:
                for (const parameter in sourceObj) 
                    changeCounter += this.tryToApplyValue(targetObj, sourceObj, parameter, logFormat);
                break;
            default:
                throw ("Undefined ApplicatorChangeType used.");
        }
        return changeCounter;
    }

    /**
     * @deprecated Legacy function. Contains duplicate code. Remove.
     */
    public tryToApplyItemMultiplier(targetObj: object, sourceObj: object, parameter: string): number 
    {
        const multiplier = sourceObj[parameter];
        if (targetObj[parameter] != null) 
        {
            const oldValue = targetObj[parameter];
            targetObj[parameter] *= multiplier;
            if (oldValue !== targetObj[parameter])
            {
                // TODO: Maybe auto calculate the spaces and make values centered for fancy output
                // this.logger.success(`"${parameter}": Successfully applied value ${targetObj[parameter]}. (was ${oldValue})`);
                // this.logger.success("├ %15s by %6s; %6s -> %6s", parameter, multiplier, oldValue, targetObj[parameter]);
                this.logger.success("├ %0s: Successfully multiplied by %0s (Before: %0s | After: %0s)", parameter, multiplier, oldValue, targetObj[parameter]);

                return 1;
            }
            else 
            {
                this.logger.info(`├ ${parameter}: New and old values are identical. No changes applied. (Current: ${targetObj[parameter]})`);
            }
        }
        else 
        {
            this.logger.explicitWarning(`[WARNING] "${parameter}" property is not found(or not set) in the target object.`);
        }
        return 0;
    }

    /**
     * @deprecated Legacy function. Contains duplicate code. Remove.
     */
    public tryToApplyAllItemMultipliers(targetObj: object, sourceObj: object): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj)
        {
            changeCounter += this.tryToApplyItemMultiplier(targetObj, sourceObj, parameter);
        }
        return changeCounter;
    }

    /**
     * @deprecated Legacy function. Contains duplicate code. Remove.
     */
    public tryToApplyItemValue(targetObj: object, sourceObj: object, parameter: string): number 
    {
        const newValue = sourceObj[parameter];
        if (targetObj[parameter] != null) 
        {
            const oldValue = targetObj[parameter];
            if (targetObj[parameter] !== newValue)
            {
                targetObj[parameter] = newValue;
                this.logger.success(`├ ${parameter}: Successfully applied value ${JSON.stringify(targetObj[parameter])} (was ${JSON.stringify(oldValue)})`);
                return 1;
            }
            else 
            {
                this.logger.info(`├ ${parameter}: Default or identical value used (${JSON.stringify(oldValue)}). No changes applied.`);
            }
        }
        else 
        {
            this.logger.explicitWarning(`[WARNING] "${parameter}" property is not found(or not set) in the target object.`);
        }
        return 0;
    }

    /**
     * @deprecated Legacy function. Contains duplicate code. Remove.
     */
    public tryToApplyAllItemValues(targetObj: object, sourceObj: object): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj)
        {
            changeCounter += this.tryToApplyItemValue(targetObj, sourceObj, parameter);
        }
        return changeCounter;
    }

    public static getNestedProperty(targetObj: object, propertyPath: string): any
    {
        if (typeof targetObj !== "object") throw `Trying to get nested property "${propertyPath}": targetObj is not an object. Check property path!`;
        if (typeof propertyPath !== "string") throw `Trying to get nested property "${propertyPath}": propertyPath is not a string`;
        
        // Replace [] notation with dot notation
        //propertyPath = propertyPath.replace(/\[["'`](.*)["'`]\]/g,".$1")

        const [head, ...rest] = propertyPath.split(".");

        if (!rest.length) return targetObj[head];
        else return this.getNestedProperty(targetObj[head], rest.join("."));
    }

    public static setNestedProperty(targetObj: object, propertyPath: string, value: any): void
    {
        if (typeof targetObj !== "object") throw `Trying to get nested property "${propertyPath}": targetObj is not an object. Check property path!`;
        if (typeof propertyPath !== "string") throw `Trying to get nested property "${propertyPath}": propertyPath is not a string`;
        
        const [head, ...rest] = propertyPath.split(".");

        if (!rest.length) targetObj[head] = value;
        else this.setNestedProperty(targetObj[head], rest.join("."), value);
    }
    
}

export { Applicator, ApplicatorLogFormat, ApplicatorChangeType }