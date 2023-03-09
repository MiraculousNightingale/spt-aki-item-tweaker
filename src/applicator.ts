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
 * Utility class which applies values and multipliers to target objects from source objects with different options.
 * As a rule returns a number of applied changes.
 * 
 * Requires a VerboseLogger to optionally output messages based on a config value.
 * 
 * Version 230309
 */
class Applicator 
{
    private logger: VerboseLogger;

    constructor(logger: VerboseLogger)
    {
        this.logger = logger;
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
        const newValue = sourceObj[parameter];
        if (targetObj[parameter] !== undefined) 
        {
            const oldValue = targetObj[parameter];
            if (targetObj[parameter] !== newValue)
            {
                targetObj[parameter] = newValue;
                switch (logFormat)
                {
                    case ApplicatorLogFormat.LIST_ENTRY:
                        this.logger.success(`├ ${parameter}: Successfully applied value ${JSON.stringify(targetObj[parameter])} (was ${JSON.stringify(oldValue)})`);
                        break;
                    default:
                        this.logger.success(`"${parameter}": Successfully applied value ${JSON.stringify(targetObj[parameter])} (was ${JSON.stringify(oldValue)})`);
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
        else 
        {
            this.logger.explicitWarning(`[WARNING] "${parameter}" property is not found(or not set) in the target object.`);
        }
        return 0;
    }

    /**
     * Tries to apply all values from source object to the target object if possible. May output success, warning and error messages.
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
        const multiplier = sourceObj[parameter];
        if (typeof multiplier !== "number" || Number.isNaN(multiplier))
        {
            this.logger.explicitError(`[ERROR] "${parameter}" property multiplier has to be a number!`);
            return 0;
        }

        if (targetObj[parameter] !== undefined) 
        {
            if (typeof targetObj[parameter] !== "number" || Number.isNaN(targetObj[parameter]))
            {
                this.logger.explicitError(`[ERROR] Type of property "${parameter}" is ${typeof targetObj[parameter]} and can't be multiplied!`);
                return 0;
            }

            const oldValue = targetObj[parameter];
            targetObj[parameter] *= multiplier;
            if (oldValue !== targetObj[parameter]) 
            {
                switch (logFormat)
                {
                    case ApplicatorLogFormat.LIST_ENTRY:
                        // Format string seems not that useful here at all, keep for reference or remove later.
                        // this.logger.success("├ %0s: Successfully multiplied by %0s (Before: %0s | After: %0s)", parameter, multiplier, oldValue, targetObj[parameter]);
                        this.logger.success(`├ ${parameter}: Successfully multiplied by ${multiplier} (Before: ${oldValue} | After: ${targetObj[parameter]})`);
                        break;
                    default:
                        this.logger.success(`"${parameter}": Successfully multiplied by ${multiplier} (Before: ${oldValue} | After: ${targetObj[parameter]})`);
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
        else 
        {
            this.logger.explicitWarning(`[WARNING] "${parameter}" property is undefined in the target object.`);
        }
        return 0;
    }

    /**
     * Tries to apply all multipliers from source object to the the properties of a target object if possible. May output success, warning and error messages.
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
     * Legacy function. Contains duplicate code. Remove.
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
     * Legacy function. Contains duplicate code. Remove.
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
     * Legacy function. Contains duplicate code. Remove.
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
     * Legacy function. Contains duplicate code. Remove.
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
}

export { Applicator, ApplicatorLogFormat }