// Parser for the subset of C expressions used in rando logic conditions.
// Loaded as a classic script by index.html and as a side-effect import by the Node scripts.
(function (root) {
    const RG = (root.RG = root.RG || {});

    const TOKEN_RE = /\s*(?:(0[xX][0-9a-fA-F]+|\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\|\||&&|==|!=|>=|<=|->|[()\[\],!<>.+\-]))/y;

    function tokenize(src) {
        const tokens = [];
        TOKEN_RE.lastIndex = 0;
        while (TOKEN_RE.lastIndex < src.length) {
            const start = TOKEN_RE.lastIndex;
            const m = TOKEN_RE.exec(src);
            if (!m) {
                if (/^\s*$/.test(src.slice(start))) {
                    break;
                }
                throw new Error(`Unexpected character at ${start} in: ${src}`);
            }
            if (m[1] !== undefined) {
                tokens.push({ t: "num", v: Number(m[1]) });
            } else if (m[2] !== undefined) {
                tokens.push({ t: "id", v: m[2] });
            } else {
                tokens.push({ t: "op", v: m[3] });
            }
        }
        return tokens;
    }

    // AST nodes:
    //   { t: "num", v }            { t: "id", name }
    //   { t: "call", name, args }  { t: "index", name, arg }
    //   { t: "not", kid }          { t: "and" | "or", kids }
    //   { t: "cmp", op, l, r }     { t: "arith", op, l, r }
    function parse(src) {
        const tokens = tokenize(src);
        let pos = 0;

        const peek = (v) => pos < tokens.length && tokens[pos].t === "op" && tokens[pos].v === v;
        const eat = (v) => {
            if (!peek(v)) {
                throw new Error(`Expected '${v}' at token ${pos} in: ${src}`);
            }
            pos++;
        };

        function parseOr() {
            const kids = [parseAnd()];
            while (peek("||")) {
                pos++;
                kids.push(parseAnd());
            }
            return kids.length === 1 ? kids[0] : { t: "or", kids };
        }

        function parseAnd() {
            const kids = [parseCmp()];
            while (peek("&&")) {
                pos++;
                kids.push(parseCmp());
            }
            return kids.length === 1 ? kids[0] : { t: "and", kids };
        }

        function parseCmp() {
            const l = parseArith();
            for (const op of ["==", "!=", ">=", "<=", ">", "<"]) {
                if (peek(op)) {
                    pos++;
                    return { t: "cmp", op, l, r: parseArith() };
                }
            }
            return l;
        }

        function parseArith() {
            let l = parseUnary();
            while (peek("+") || peek("-")) {
                const op = tokens[pos++].v;
                l = { t: "arith", op, l, r: parseUnary() };
            }
            return l;
        }

        function parseUnary() {
            if (peek("!")) {
                pos++;
                return { t: "not", kid: parseUnary() };
            }
            return parsePrimary();
        }

        function parsePrimary() {
            const tok = tokens[pos];
            if (!tok) {
                throw new Error(`Unexpected end of expression: ${src}`);
            }
            if (tok.t === "num") {
                pos++;
                return { t: "num", v: tok.v };
            }
            if (tok.t === "id") {
                pos++;
                if (peek("(")) {
                    pos++;
                    const args = [];
                    if (!peek(")")) {
                        args.push(parseOr());
                        while (peek(",")) {
                            pos++;
                            args.push(parseOr());
                        }
                    }
                    eat(")");
                    return { t: "call", name: tok.v, args };
                }
                if (peek("[")) {
                    pos++;
                    const arg = parseOr();
                    eat("]");
                    return { t: "index", name: tok.v, arg };
                }
                if (peek(".") || peek("->")) {
                    throw new Error(`Member access on '${tok.v}' is not supported: ${src}`);
                }
                return { t: "id", name: tok.v };
            }
            if (peek("(")) {
                pos++;
                const inner = parseOr();
                eat(")");
                return inner;
            }
            throw new Error(`Unexpected token '${tok.v}' in: ${src}`);
        }

        const ast = parseOr();
        if (pos !== tokens.length) {
            throw new Error(`Trailing tokens in: ${src}`);
        }
        return ast;
    }

    RG.parseExpr = parse;
})(globalThis);
