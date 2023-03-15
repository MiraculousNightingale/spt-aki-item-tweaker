import { Applicator } from "./applicator";

type BasicExpression = {
    key: string;
    operation?: "greater_than" | "less_than" | "equals" | "starts_with" | "contains" | "ends_with";
    values: any[];
    negation?: boolean;
    strict?: boolean;
}

type LogicalExpression = {
    condition: "and" | "or";
    expressions: Expression[];
    negation?: boolean;
}

type Expression = BasicExpression | LogicalExpression;

/**
 * Utility class which provides functions to process queries.
 */
class Query 
{
    public static evaluateBasicExpression(expression: BasicExpression, targetObj: any): boolean
    {
        const {key, values} = expression;
        const operation = expression.operation ?? "equals";
        const negation = expression.negation ?? false;
        const strict = expression.strict ?? false;
        try 
        {
            // const propValue = obj[key];
            const propValue = Applicator.getNestedProperty(targetObj, key);
            const propType = typeof propValue;

            //Maybe null/undefined should be checked
            if (propValue == null) return false;

            if (values.some(value => propType !== typeof value) && !Array.isArray(propValue))
            {
                throw (`Query values "${values.filter(value => propType !== typeof value)}" with key "${key}" don't match target property type ${propType}`);
            }

            let result = null;
            // const testMethod = strict ? "every" : "some";
            const testMethod = strict ? values.every : values.some;
            if (operation === "equals")
            {
                result = testMethod.call(values, (value: any) => JSON.stringify(propValue) === JSON.stringify(value)); // Support array and object comparisons with JSON.stringify
                return negation ? !result : result;
            }
            switch (propType)
            {
                case "string":
                    switch (operation)
                    {
                        case "contains": result = testMethod.call(values, (value: string) => new RegExp(value + "").test(propValue + "")); break;
                        case "starts_with": result = testMethod.call(values, (value: string) => new RegExp("^" + value + "").test(propValue + "")); break;
                        // Implement ends_with
                        case "ends_with": result = testMethod.call(values, (value: string) => new RegExp("" + value + "$").test(propValue + "")); break;
                        default: throw (`Can't apply "${operation}" operation to object property "${key}" with type "${propType}"`);
                    }
                    break;
                case "number":
                    switch (operation)
                    {
                        case "greater_than": result = testMethod.call(values, (value: number) => propValue > value); break;
                        case "less_than": result = testMethod.call(values, (value: number) => propValue < value); break;
                        default: throw (`Can't apply "${operation}" operation to object property "${key}" with type "${propType}"`);
                    }
                    break;
                    // Add support for "contains" operation to check arrays or objects
                case "object": throw (`Can't apply "${operation}" operation to object property "${key}" with type "${propType}"`);
                default: throw (`You shouldn't really reach this point. Query key is "${key}", values are "${values}. What kind of type is "${propType}"?`);
            }
            if (result === null) throw ("Evaluation didn't reach the proper test function.");
            return negation ? !result : result;
        }
        catch (error) 
        {
            // Most likely an exception will be thrown by the getNestedProperty
            return negation ? true : false;
        }
    }

    public static evaluateLogicalExpression(expression: LogicalExpression, targetObj: any): boolean
    {
        const negation = expression.negation ?? false; 
        const { condition, expressions } = expression;
        const testMethod = condition == "and" ? expressions.every : expressions.some;
        const result = testMethod.call(expressions, (expression: Expression) => 
        {
            return this.evaluateQuery(expression, targetObj);
        });
        return negation ? !result : result;
    }

    public static evaluateQuery(query: Expression, targetObj: any): boolean 
    {
        if (this.isQuery(query)) // Not really needed but just as a safeguard.
        {
            if (this.isLogicalExpression(query))
                return this.evaluateLogicalExpression(query, targetObj);
            if (this.isBasicExpression(query))
            // Maybe move isPrivateProperty check into evaluateBasicExpression
                return this.evaluateBasicExpression(query, this.isPrivateProperty(query.key) ? targetObj : targetObj._props);
        }
        throw ("Wrong expression object structure.");
    }

    public static isBasicExpression(targetObj: any): targetObj is BasicExpression
    {
        const asBasicExpr = (targetObj as BasicExpression);
        return targetObj != null && 
            typeof asBasicExpr.key === "string" && 
            typeof asBasicExpr.operation === "string" || typeof asBasicExpr.operation === "undefined" &&
            typeof asBasicExpr.negation === "boolean" || typeof asBasicExpr.negation === "undefined" &&
            typeof asBasicExpr.strict === "boolean" || typeof asBasicExpr.strict === "undefined" &&
            Array.isArray(asBasicExpr.values);
    }

    public static isLogicalExpression(targetObj: any): targetObj is LogicalExpression
    {
        const asLogicExpr = (targetObj as LogicalExpression);
        return targetObj != null &&
            ["and", "or"].some(cond => cond === asLogicExpr.condition) &&
            typeof asLogicExpr.negation === "boolean" || typeof asLogicExpr.negation === "undefined" &&
            Array.isArray(asLogicExpr.expressions);
    }

    public static isQuery(targetObj: any): targetObj is Expression
    {
        const isBasicExpr = this.isBasicExpression(targetObj);
        const isLogicExpr = this.isLogicalExpression(targetObj);
        if (isBasicExpr && isLogicExpr) return false; // Can't be both at the same time
        if (isBasicExpr)
            return true;
        if (isLogicExpr)
            return targetObj.expressions.every(expression => this.isQuery(expression));
        return false;
    }

    /**
     * Primitive check to see where the property is private or not. Private properties are designated with an underscore.
     * @param propertyName String of a property name to be checked.
     * @returns Check result.
     */
    public static isPrivateProperty(propertyName: string): boolean
    {
        return propertyName.charAt(0) === "_";
    }
}

export { Query, Expression, BasicExpression, LogicalExpression };