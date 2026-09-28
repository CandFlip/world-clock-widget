import { env } from 'cloudflare:workers';
import { mergeMethodRows, type SupportMethod } from './support-method-merge';

export type { SupportMethod } from './support-method-merge';

export function defaultSupportMethods(): SupportMethod[] {
  const methods: SupportMethod[] = [
    { id: 'tinkoff-mir', label: 'Тинькофф · Мир', instructions: '2200 7008 1819 4952', image: '', url: '', active: '1' },
    { id: 'centercredit-visa', label: 'Банк ЦентрКредит · Visa', instructions: '4899 9333 8009 2328', image: '', url: '', active: '1' },
  ];
  if (env.BYBIT_USDT_TRC20_ADDRESS) methods.unshift({ id: 'bybit-usdt-trc20', label: 'USDT · TRC20', instructions: env.BYBIT_USDT_TRC20_ADDRESS, image: '', url: '', active: '1' });
  if (env.BYBIT_UID) methods.unshift({ id: 'bybit-internal', label: 'Bybit · UID', instructions: env.BYBIT_UID, image: '', url: '', active: '1' });
  return methods;
}

export function mergeSupportMethods(rows: SupportMethod[], includeHidden = false): SupportMethod[] {
  return mergeMethodRows(defaultSupportMethods(), rows, includeHidden);
}
