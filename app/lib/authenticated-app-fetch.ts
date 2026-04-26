export async function authenticatedAppFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const token = await shopify.idToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
