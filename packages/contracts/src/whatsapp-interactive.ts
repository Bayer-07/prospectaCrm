export type WhatsappInteractiveButton = {
  id: string;
  text: string;
};

export type WhatsappInteractiveSelection = {
  id: string;
  text: string;
};

export type WhatsappInteractiveMessage = {
  kind: 'buttons' | 'template' | 'interactive' | 'list' | 'response';
  header: string | null;
  body: string | null;
  footer: string | null;
  buttons: WhatsappInteractiveButton[];
  selection: WhatsappInteractiveSelection | null;
};

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null
);

const asText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return null;
};

const objectFromJson = (value: unknown): AnyRecord | null => {
  const record = asRecord(value);
  if (record) return record;
  if (typeof value !== 'string') return null;
  try { return asRecord(JSON.parse(value)); } catch { return null; }
};

const arrayFrom = (value: unknown) => Array.isArray(value) ? value : [];

function buttonFrom(value: unknown): WhatsappInteractiveButton | null {
  const node = asRecord(value);
  if (!node) return null;
  const buttonText = asRecord(node.buttonText);
  const quickReply = asRecord(node.quickReplyButton)
    || asRecord(node.quick_reply_button)
    || asRecord(node.quickReply);
  const text = asText(
    node.displayText,
    node.display_text,
    node.title,
    node.text,
    node.buttonText,
    buttonText?.displayText,
    buttonText?.display_text,
    quickReply?.displayText,
    quickReply?.display_text,
  );
  const id = asText(
    node.buttonId,
    node.button_id,
    node.id,
    node.rowId,
    node.row_id,
    quickReply?.id,
    quickReply?.buttonId,
  );
  if (!text || !id) return null;
  return { id, text };
}

function nativeFlowButtons(value: unknown) {
  const buttons: WhatsappInteractiveButton[] = [];
  for (const item of arrayFrom(value)) {
    const node = asRecord(item);
    if (!node) continue;
    const params = objectFromJson(node.buttonParamsJson || node.buttonParamsJSON || node.paramsJson);
    const name = asText(node.name)?.toLowerCase();
    if (name === 'single_select') {
      const sections = arrayFrom(params?.sections || node.sections);
      for (const section of sections) {
        const rows = arrayFrom(asRecord(section)?.rows);
        for (const row of rows) {
          const button = buttonFrom(row);
          if (button) buttons.push(button);
        }
      }
      continue;
    }
    const button = buttonFrom({ ...node, ...(params || {}) });
    if (button) buttons.push(button);
  }
  return buttons;
}

function uniqueButtons(buttons: WhatsappInteractiveButton[]) {
  const seen = new Set<string>();
  return buttons.filter((button) => {
    const key = `${button.id}\u0000${button.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findInteractiveNode(input: unknown) {
  const pending = [input];
  const visited = new Set<AnyRecord>();
  while (pending.length) {
    const candidate = asRecord(pending.shift());
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);
    if (
      candidate.buttonsMessage
      || candidate.templateMessage
      || candidate.interactiveMessage
      || candidate.buttonsResponseMessage
      || candidate.templateButtonReplyMessage
      || candidate.listMessage
      || candidate.listResponseMessage
      || candidate.interactiveResponseMessage
    ) return candidate;
    for (const key of ['message', 'Message', 'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
      const nested = asRecord(candidate[key]);
      if (nested) pending.push(nested);
    }
  }
  return null;
}

export function extractWhatsappInteractive(input: unknown): WhatsappInteractiveMessage | null {
  const root = findInteractiveNode(input);
  if (!root) return null;

  const buttonsMessage = asRecord(root.buttonsMessage);
  if (buttonsMessage) {
    return {
      kind: 'buttons',
      header: asText(buttonsMessage.headerText, asRecord(buttonsMessage.header)?.title),
      body: asText(buttonsMessage.contentText, buttonsMessage.bodyText, asRecord(buttonsMessage.body)?.text),
      footer: asText(buttonsMessage.footerText, asRecord(buttonsMessage.footer)?.text),
      buttons: uniqueButtons(arrayFrom(buttonsMessage.buttons).map(buttonFrom).filter((button): button is WhatsappInteractiveButton => Boolean(button))),
      selection: null,
    };
  }

  const templateMessage = asRecord(root.templateMessage);
  const hydratedTemplate = templateMessage
    ? asRecord(templateMessage.hydratedTemplate) || asRecord(templateMessage.hydratedFourRowTemplate)
    : null;
  if (hydratedTemplate) {
    const buttons = arrayFrom(hydratedTemplate.hydratedButtons)
      .map(buttonFrom)
      .filter((button): button is WhatsappInteractiveButton => Boolean(button));
    return {
      kind: 'template',
      header: asText(hydratedTemplate.hydratedTitleText, hydratedTemplate.hydratedHeaderText),
      body: asText(hydratedTemplate.hydratedContentText, hydratedTemplate.contentText),
      footer: asText(hydratedTemplate.hydratedFooterText),
      buttons: uniqueButtons(buttons),
      selection: null,
    };
  }

  const interactiveMessage = asRecord(root.interactiveMessage);
  if (interactiveMessage) {
    const body = asRecord(interactiveMessage.body);
    const header = asRecord(interactiveMessage.header);
    const footer = asRecord(interactiveMessage.footer);
    const nativeFlow = asRecord(interactiveMessage.nativeFlowMessage);
    const buttons = uniqueButtons(nativeFlowButtons(nativeFlow?.buttons));
    const hasSingleSelect = arrayFrom(nativeFlow?.buttons).some((item) => asText(asRecord(item)?.name)?.toLowerCase() === 'single_select');
    return {
      kind: hasSingleSelect ? 'list' : 'interactive',
      header: asText(header?.title, header?.text),
      body: asText(body?.text),
      footer: asText(footer?.text),
      buttons,
      selection: null,
    };
  }

  const buttonsResponse = asRecord(root.buttonsResponseMessage);
  if (buttonsResponse) {
    const id = asText(buttonsResponse.selectedButtonId, buttonsResponse.selectedId);
    const text = asText(buttonsResponse.selectedDisplayText, buttonsResponse.selectedText, id);
    return id && text
      ? { kind: 'response', header: null, body: null, footer: null, buttons: [], selection: { id, text } }
      : null;
  }

  const templateResponse = asRecord(root.templateButtonReplyMessage);
  if (templateResponse) {
    const id = asText(templateResponse.selectedId, templateResponse.selectedButtonId);
    const text = asText(templateResponse.selectedDisplayText, templateResponse.selectedText, id);
    return id && text
      ? { kind: 'response', header: null, body: null, footer: null, buttons: [], selection: { id, text } }
      : null;
  }

  const listResponse = asRecord(root.listResponseMessage);
  if (listResponse) {
    const reply = asRecord(listResponse.singleSelectReply);
    const id = asText(reply?.selectedRowId, listResponse.selectedRowId);
    const text = asText(listResponse.title, listResponse.description, id);
    return id && text
      ? { kind: 'response', header: null, body: null, footer: null, buttons: [], selection: { id, text } }
      : null;
  }

  const interactiveResponse = asRecord(root.interactiveResponseMessage);
  if (interactiveResponse) {
    const nativeFlowResponse = asRecord(interactiveResponse.nativeFlowResponseMessage);
    const params = objectFromJson(nativeFlowResponse?.paramsJson);
    const id = asText(params?.id, params?.button_id, params?.row_id, nativeFlowResponse?.id);
    const text = asText(params?.display_text, params?.title, params?.text, id);
    return id && text
      ? { kind: 'response', header: null, body: null, footer: null, buttons: [], selection: { id, text } }
      : null;
  }

  return null;
}

export function whatsappInteractiveText(input: unknown) {
  const interactive = extractWhatsappInteractive(input);
  return interactive?.selection?.text || interactive?.body || null;
}
