const PUBLISHABLE_KEY = /^pk_(?:test|live)_\S+$/;

/** pk_test_ and pk_live_ only. Empty and malformed keys become an empty string. */
export function usablePublishableKey(value: string) {
  return PUBLISHABLE_KEY.test(value) ? value : "";
}
