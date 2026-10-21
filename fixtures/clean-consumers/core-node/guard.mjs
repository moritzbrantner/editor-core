// Fails any attempt to load React, the JSX runtime or the React entrypoint from core imports.
import { register } from "node:module";

const hooks = `
const forbidden = /^(react|react-dom|scheduler)(\\/|$)|^@moenarch\\/editor-core\\/react$/;
export async function resolve(specifier, context, next) {
  if (forbidden.test(specifier)) {
    throw new Error("Core-only consumer loaded " + specifier + " from " + context.parentURL);
  }
  return next(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`);
