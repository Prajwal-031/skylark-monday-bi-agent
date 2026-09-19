import { normalizeKey } from './normalization.js';

const aliases = {
  amount: ['amount', 'dealvalue', 'dealamount', 'maskeddealvalue', 'expectedrevenue', 'value'],
  sector: ['sector', 'sectorservice', 'industry', 'vertical'],
  stage: ['stage', 'dealstage', 'pipelinestage'],
  status: ['status', 'dealstatus', 'projectstatus'],
  close_date: ['expectedclose', 'expectedclosedate', 'tentativeclosedate', 'closingdate', 'closedate', 'duedate'],
  owner: ['owner', 'salesowner', 'person'],
  completion_date: ['completiondate', 'completeddate', 'actualcompletion', 'probableenddate'],
  start_date: ['startdate', 'projectstart', 'probablestartdate'],
  work_order_value: ['projectvalue', 'workordervalue', 'amountinrupeesexclofgstmasked', 'amount', 'value'],
  external_id: ['dealid', 'opportunityid', 'workorderid', 'projectid', 'customerid']
};

export function discoverSchema(columns, entity) {
  const result = {};
  const ambiguity = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const matches = columns.filter((column) => candidates.includes(normalizeKey(column.title)));
    if (matches.length === 1) result[field] = matches[0].id;
    if (matches.length > 1) ambiguity[field] = matches.map((match) => match.title);
  }
  // Work-order value must not be presumed from generic deal amount unless a title was actually matched.
  if (entity === 'work_orders' && result.amount && !result.work_order_value) result.work_order_value = result.amount;
  return { fields: result, ambiguity, columns: columns.map(({ id, title, type }) => ({ id, title, type })) };
}
