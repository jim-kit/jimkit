const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|Opera Mini|Mobile Safari/i;
/** A first guess from the user agent so the server renders the right layout; the real screen decides afterwards. */
export const isMobileUa = (ua: string) => MOBILE_UA.test(ua);
