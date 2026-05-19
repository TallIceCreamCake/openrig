export const setCookie = (name: string, value: string, days = 7) => {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${d.toUTCString()}`;
  const parts = [`${name}=${encodeURIComponent(value)}`, expires, 'path=/', 'SameSite=Lax'];
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }
  document.cookie = parts.join(';');
};

export const getCookie = (name: string) => {
  const cname = name + '=';
  const rawCookie = document.cookie || '';
  const ca = rawCookie.split(';');
  for (let c of ca) {
    while (c.charAt(0) === ' ') c = c.substring(1);
    if (c.indexOf(cname) === 0) {
      const rawValue = c.substring(cname.length, c.length);
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return '';
};

export const deleteCookie = (name: string) => {
  const parts = [`${name}=`, 'expires=Thu, 01 Jan 1970 00:00:00 UTC', 'path=/', 'SameSite=Lax'];
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }
  document.cookie = parts.join(';');
};
