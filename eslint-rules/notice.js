// Local rule: a notice (error, result, "done" message) must not be cleared before the action it belongs to runs.
//
//   async function save() {
//     setError(undefined);          // <- flagged: the alert vanishes, and comes back when the call ends
//     try { await api.save(); } catch (e) { setError(msg(e)); }
//   }
//
// While the call runs the old notice stays on screen; the result replaces it (clear it when the action succeeds, inside
// the try, after the await). `useAction` of the ui-kit does exactly that. Clearing in a handler that does no async
// work (it only switches the screen) is fine and is not flagged.
const SETTER = /^set(Error|Err|Notice|Done|Result|Message|Success|Info|Status)$/;

function isClear(stmt) {
  if (stmt.type !== "ExpressionStatement" || stmt.expression.type !== "CallExpression") return false;
  const { callee, arguments: args } = stmt.expression;
  return (
    callee.type === "Identifier" &&
    SETTER.test(callee.name) &&
    args.length === 1 &&
    ((args[0].type === "Identifier" && args[0].name === "undefined") || (args[0].type === "Literal" && args[0].value === null))
  );
}

function hasAsyncWork(node, visitorKeys) {
  let found = false;
  (function walk(n) {
    if (found || !n || typeof n.type !== "string") return;
    if (n.type === "AwaitExpression") return void (found = true);
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property.name === "then") return void (found = true);
    for (const key of visitorKeys[n.type] ?? []) {
      const v = n[key];
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
    }
  })(node);
  return found;
}

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      clearBefore:
        "Do not clear the notice before the async action: it disappears and comes back. Keep it on screen while the call runs and clear or replace it when the call ends (or use useAction).",
    },
  },
  create(context) {
    const keys = context.sourceCode.visitorKeys;
    function check(fn) {
      if (fn.body?.type !== "BlockStatement") return;
      const body = fn.body.body;
      body.forEach((stmt, i) => {
        if (isClear(stmt) && body.slice(i + 1).some((s) => hasAsyncWork(s, keys))) {
          context.report({ node: stmt, messageId: "clearBefore" });
        }
      });
    }
    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check };
  },
};
