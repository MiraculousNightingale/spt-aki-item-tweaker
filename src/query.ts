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
    public static evaluateBasicExpression(expression: BasicExpression, obj: any): boolean
    {
        const {key, values} = expression;
        const operation = expression.operation ?? "equals";
        const negation = expression.negation ?? false;
        const strict = expression.strict ?? false;
        const propValue = obj[key];
        const propType = typeof propValue;

        //Maybe null/undefined should be checked
        if (propValue == null) return false;

        if (values.some(value => propType !== typeof value))
        {
            throw (`One or more values don't match type ${propType}`);
        }

        let result = null;
        const testMethod = strict ? "every" : "some";
        if (operation === "equals")
        {
            result = values[testMethod](value => JSON.stringify(propValue) === JSON.stringify(value));
            return negation ? !result : result;
        }
        switch (propType)
        {
            case "string":
                switch (operation)
                {
                    case "contains": result = values[testMethod](value => new RegExp(value + "").test(propValue + "")); break;
                    case "starts_with": result = values[testMethod](value => new RegExp("^" + value + "").test(propValue + "")); break;
                        // Implement ends_with
                    case "ends_with": result = values[testMethod](value => new RegExp("" + value + "$").test(propValue + "")); break;
                    default: throw (`Can't apply "${operation}" operation to type "${propType}"`);
                }
                break;
            case "number":
                switch (operation)
                {
                    case "greater_than": result = values[testMethod](value => propValue > value); break;
                    case "less_than": result = values[testMethod](value => propValue < value); break;
                    default: throw (`Can't apply "${operation}" operation to type "${propType}"`);
                }
                break;
            // Add support for "contains" operation to check arrays or objects
            case "object": throw (`Can't apply "${operation}" operation to type "${propType}"`);
            default: throw (`You shouldn't really reach this point. What kind of type is "${propType}"?`);
        }
        if (result === null) throw ("Evaluation didn't reach the proper test function.");
        return negation ? !result : result;
    }

    public static evaluateLogicalExpression(expression: LogicalExpression, obj: any): boolean
    {
        const negation = expression.negation ?? false; 
        const { condition, expressions } = expression;
        const testMethod = condition == "and" ? expressions.every : expressions.some;
        const result = testMethod.call(expressions, (expression) => 
        {
            return this.evaluateQuery(expression, obj);
        });
        return negation ? !result : result;
    }

    public static evaluateQuery(query: Expression, obj: any): boolean 
    {
        if (this.isQuery(query)) // Not really needed but just as a safeguard.
        {
            if (this.isLogicalExpression(query))
                return this.evaluateLogicalExpression(query, obj);
            if (this.isBasicExpression(query))
            // Maybe move isPrivateProperty check into evaluateBasicExpression
                return this.evaluateBasicExpression(query, this.isPrivateProperty(query.key) ? obj : obj._props);
        }
        throw ("Wrong expression object structure.");
    }

    public static isBasicExpression(obj: any): obj is BasicExpression
    {
        const asBasicExpr = (obj as BasicExpression);
        return obj != null && 
            typeof asBasicExpr.key === "string" && 
            typeof asBasicExpr.operation === "string" || typeof asBasicExpr.operation === "undefined" &&
            typeof asBasicExpr.negation === "boolean" || typeof asBasicExpr.negation === "undefined" &&
            typeof asBasicExpr.strict === "boolean" || typeof asBasicExpr.strict === "undefined" &&
            Array.isArray(asBasicExpr.values);
    }

    public static isLogicalExpression(obj: any): obj is LogicalExpression
    {
        const asLogicExpr = (obj as LogicalExpression);
        return obj != null &&
            ["and", "or"].some(cond => cond === asLogicExpr.condition) &&
            typeof asLogicExpr.negation === "boolean" || typeof asLogicExpr.negation === "undefined" &&
            Array.isArray(asLogicExpr.expressions);
    }

    public static isQuery(object: any): object is Expression
    {
        const isBasicExpr = this.isBasicExpression(object);
        const isLogicExpr = this.isLogicalExpression(object);
        if (isBasicExpr && isLogicExpr) return false; // Can't be both at the same time
        if (isBasicExpr)
            return true;
        if (isLogicExpr)
            return object.expressions.every(expression => this.isQuery(expression));
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