/** Routes of the gateway (routes.yaml) that the UI asks `can()` about: the gateway answers from the RPC rules. */
export const ROUTES = {
  listSaved: "GET /api/dictionary/saved",
  saveWord: "POST /api/dictionary/saved",
} as const;
