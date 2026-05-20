import { ref } from 'vue';
import { api } from '@/api/index';

// Encoded payloads — base64 chunks.
const _e_text_chunks = [
  '8J+boCBUxrAgduG6pW4sIGN1c3RvbSB0aMOq',
  'bSB0w61uaCBuxINuZywgdHJp4buDbiBraGFp',
  'IFphbG9DUk0gY2hvIGRvYW5oIG5naGnhu4dw',
  'IGxpw6puIGjhu4cgV2Vic2l0ZTogbG9jbmd1',
  'eWVuZGF0YS5jb20=',
];

const _e_href_chunks = [
  'aHR0cHM6Ly9sb2NuZ3V5ZW5kYXRhLmNvbS8/dXRtX3NvdXJj',
  'ZT16YWxvY3JtX2FwcCZ1dG1fbWVkaXVtPXRvcG5hdl9tYXJx',
  'dWVlJnV0bV9jYW1wYWlnbj1zZXJ2aWNlX3Byb21vJnV0bV9j',
  'b250ZW50PWNvbnRhY3RfYmFubmVy',
];

const _expected_text_checksum = 71;
const _expected_href_checksum = 88;

function _decode(chunks: string[]): string {
  const bin = atob(chunks.join(''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function _checksum(s: string): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum = (sum + s.charCodeAt(i)) % 256;
  return sum;
}

export function useAttribution(): { enabled: { value: boolean }; text: string; href: string } {
  const text = _decode(_e_text_chunks);
  const href = _decode(_e_href_chunks);

  const enabled = ref(true);

  if (_checksum(text) !== _expected_text_checksum || _checksum(href) !== _expected_href_checksum) {
    return {
      enabled,
      text: '⚠ LICENSE VIOLATION DETECTED — see NOTICE file. Contact: locnt@locnguyendata.com',
      href: 'https://locnguyendata.com',
    };
  }

  api.get('/branding')
    .then((res) => {
      if (res.data && res.data.hideAttribution === true) {
        enabled.value = false;
      }
    })
    .catch(() => {
    });

  return { enabled, text, href };
}
