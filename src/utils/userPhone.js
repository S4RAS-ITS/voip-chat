export async function emailToVoipExtension(email) {
  // Encode email ke Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(email);

  // Hash SHA-1 menggunakan Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);

  // Convert hash buffer ke hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Ambil hanya digit angka
  const numericHash = hex.replace(/\D/g, '');

  // Ambil 5 digit pertama
  let suffix = numericHash.slice(0, 5);

  // Fallback jika tidak cukup 5 digit
  if (suffix.length < 5) {
    const ascii = Array.from(email).map(c => c.charCodeAt(0)).join('');
    suffix = ascii.slice(0, 5).padEnd(5, '0');
  }

  return '10' + suffix;
}
