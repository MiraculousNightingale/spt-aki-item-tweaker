import { VerboseLogger } from "./verbose_logger";

/**
 * Utility class which applies values and multipliers to target objects from source objects with different options.
 * As a rule returns a number of applied changes.
 * 
 * Requires a VerboseLogger to optionally output messages based on a config value.
 * 
 * Version 230307
 */
class Applicator 
{
    private logger: VerboseLogger;

    constructor(logger: VerboseLogger)
    {
        this.logger = logger;
    }

    public tryToApplyValue(targetObj: object, sourceObj: object, parameter: string): number 
    {
        const newValue = sourceObj[parameter];
        if (targetObj[parameter] != null) 
        {
            const oldValue = targetObj[parameter];
            if (targetObj[parameter] !== newValue)
            {
                targetObj[parameter] = newValue;
                this.logger.success(`'${parameter}': Successfully applied value ${targetObj[parameter]} (was ${oldValue})`);
                return 1;
            }
            else 
            {
                this.logger.info(`'${parameter}': Default or identical value used (${oldValue}). No changes applied.`);
            }
        }
        else 
        {
            this.logger.explicitWarning(`[WARNING] ${parameter} property is not found(or not set) in the target object.`);
        }
        return 0;
    }

    public tryToApplyAllValues(targetObj: object, sourceObj: object): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj) 
        {
            changeCounter += this.tryToApplyValue(targetObj, sourceObj, parameter);
        }
        return changeCounter;
    }

    public tryToApplyMultiplier(targetObj: object, sourceObj: object, parameter: string): number 
    {
        const multiplier = sourceObj[parameter];
        if (targetObj[parameter] != null) 
        {
            const oldValue = targetObj[parameter];
            targetObj[parameter] *= multiplier;
            if (oldValue !== targetObj[parameter]) 
            {
                this.logger.success(`'${parameter}': Successfully multiplied by ${multiplier} (Before: ${oldValue} | After: ${targetObj[parameter]})`);
                return 1;
            }
            else 
            {
                this.logger.info(`'${parameter}': New and old values are identical. No changes applied. (Current: ${targetObj[parameter]})`);
            }
        }
        else 
        {
            this.logger.explicitWarning(`[WARNING] ${parameter} property is not found(or not set) in the target object.`);
        }
        return 0;
    }

    public tryToApplyAllMultipliers(targetObj: object, sourceObj: object): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj) 
        {
            changeCounter += this.tryToApplyMultiplier(targetObj, sourceObj, parameter);
        }
        return changeCounter;
    }

    public tryToApplyItemMultiplier(targetObj: object, sourceObj: object, parameter: string): number 
    {
        const multiplier = sourceObj[parameter];
        if (targetObj[parameter] != null) 
        {
            const oldValue = targetObj[parameter];
            targetObj[parameter] *= multiplier;
            if (oldValue !== targetObj[parameter])
            {
                // TODO: Auto calculate the spaces and make values centered for fancy output
                // this.logger.success(`'${parameter}': Successfully applied value ${targetObj[parameter]}. (was ${oldValue})`);
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
            this.logger.explicitWarning(`[WARNING] ${parameter} property is not found(or not set) in the target object.`);
        }
        return 0;
    }

    public tryToApplyAllItemMultipliers(targetObj: object, sourceObj: object): number 
    {
        let changeCounter = 0;
        for (const parameter in sourceObj)
        {
            changeCounter += this.tryToApplyItemMultiplier(targetObj, sourceObj, parameter);
        }
        return changeCounter;
    }

    public tryToApplyItemValue(targetObj: object, sourceObj: object, parameter: string): number 
    {
        const newValue = sourceObj[parameter];
        if (targetObj[parameter] != null) 
        {
            const oldValue = targetObj[parameter];
            if (targetObj[parameter] !== newValue)
            {
                targetObj[parameter] = newValue;
                this.logger.success(`├ ${parameter}: Successfully applied value ${targetObj[parameter]} (was ${oldValue})`);
                return 1;
            }
            else 
            {
                this.logger.info(`├ ${parameter}: Default or identical value used (${oldValue}). No changes applied.`);
            }
        }
        else 
        {
            this.logger.explicitWarning(`[WARNING] ${parameter} property is not found(or not set) in the target object.`);
        }
        return 0;
    }

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

export { Applicator }