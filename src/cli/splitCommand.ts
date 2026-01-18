export function splitCommand(input: string): string[] {
    const args: string[] = [];
    let cur = "";
    let quote: "'" | '"' | null = null;
    let escape = false;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (escape) {
            cur += char;
            escape = false;
            continue;
        }

        if (!quote && char === "\\") {
            escape = true;
            continue;
        }

        if (!quote && (char === "'" || char === '"')) {
            quote = char as any;
            continue;
        }

        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                cur += char;
            }
            continue;
        }
        if (char === " " || char === "\t" || char === "\n") {
            if (cur.length) {
                args.push(cur);
                cur = "";
            }
            continue;
        }

        cur += char;
    }
    if (escape) cur += "\\"; // cas extrême
    if (cur.length) args.push(cur);
    return args;
}