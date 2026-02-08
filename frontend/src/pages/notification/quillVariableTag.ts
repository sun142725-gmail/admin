import type ReactQuill from 'react-quill';

type VariableSource = 'user' | 'event' | 'system' | 'custom';

export interface VariableTagValue {
  key: string;
  label?: string;
  source?: VariableSource;
  required?: boolean;
}

const VARIABLE_REGEX = /{{\s*var\.([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;

const SOURCE_STYLE_MAP: Record<VariableSource, { color: string; bgColor: string }> = {
  user: { color: '#0958d9', bgColor: '#e6f4ff' },
  event: { color: '#389e0d', bgColor: '#f6ffed' },
  system: { color: '#531dab', bgColor: '#f9f0ff' },
  custom: { color: '#d46b08', bgColor: '#fff7e6' }
};

const getSourceStyle = (source?: string) => {
  if (source && source in SOURCE_STYLE_MAP) {
    return SOURCE_STYLE_MAP[source as VariableSource];
  }
  return SOURCE_STYLE_MAP.custom;
};

const getVariableLabel = (key: string) => {
  const builtinMap: Record<string, string> = {
    userNickname: '用户昵称',
    eventInfo: '事件信息',
    systemParam: '系统参数'
  };
  return builtinMap[key] ?? key;
};

let registered = false;

export const registerVariableTagBlot = (QuillCtor: NonNullable<(typeof ReactQuill)['Quill']>) => {
  if (registered) {
    return;
  }
  const Embed = QuillCtor.import('blots/embed');
  const Delta = QuillCtor.import('delta');

  class VariableTagBlot extends Embed {
    static blotName = 'variableTag';

    static tagName = 'span';

    static className = 'ql-variable-tag';

    static create(value: VariableTagValue) {
      const node = super.create() as HTMLElement;
      const key = value.key;
      const source = value.source ?? 'custom';
      const label = value.label ?? getVariableLabel(key);
      const style = getSourceStyle(source);
      node.setAttribute('data-var-key', key);
      node.setAttribute('data-var-source', source);
      node.setAttribute('data-var-label', label);
      node.setAttribute('contenteditable', 'false');
      node.style.display = 'inline-block';
      node.style.padding = '1px 10px';
      node.style.margin = '0 2px';
      node.style.borderRadius = '10px';
      node.style.border = `1px solid ${style.color}`;
      node.style.backgroundColor = style.bgColor;
      node.style.color = style.color;
      node.style.fontSize = '12px';
      node.style.lineHeight = '20px';
      node.innerText = label;
      return node;
    }

    static value(domNode: HTMLElement): VariableTagValue {
      return {
        key: domNode.getAttribute('data-var-key') ?? '',
        label: domNode.getAttribute('data-var-label') ?? '',
        source: (domNode.getAttribute('data-var-source') as VariableSource | null) ?? 'custom'
      };
    }
  }

  QuillCtor.register(VariableTagBlot, true);
  (QuillCtor as any).__VariableDeltaCtor = Delta;
  registered = true;
};

export const installVariableTagMatcher = (
  quill: any,
  variableMetaMap?: Record<string, { label: string; source: string }>
) => {
  if (!quill || quill.__variableMatcherInstalled) {
    return;
  }
  const DeltaCtor = quill.constructor.__VariableDeltaCtor || quill.import('delta');
  quill.clipboard.addMatcher(Node.TEXT_NODE, (node: Text, delta: any) => {
    const ops = delta?.ops ?? [];
    const next = new DeltaCtor();
    ops.forEach((op: any) => {
      if (typeof op.insert !== 'string') {
        next.insert(op.insert, op.attributes);
        return;
      }
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      VARIABLE_REGEX.lastIndex = 0;
      while ((match = VARIABLE_REGEX.exec(op.insert)) !== null) {
        const plain = op.insert.slice(lastIndex, match.index);
        if (plain) {
          next.insert(plain, op.attributes);
        }
        const key = match[1];
        const variableMeta = variableMetaMap?.[key];
        next.insert({
          variableTag: {
            key,
            label: variableMeta?.label ?? getVariableLabel(key),
            source: variableMeta?.source ?? 'custom'
          }
        });
        lastIndex = match.index + match[0].length;
      }
      const tail = op.insert.slice(lastIndex);
      if (tail) {
        next.insert(tail, op.attributes);
      }
    });
    return next;
  });
  quill.__variableMatcherInstalled = true;
};

export const serializeTemplateContent = (html: string) => {
  return html.replace(
    /<span[^>]*class="[^"]*ql-variable-tag[^"]*"[^>]*data-var-key="([^"]+)"[^>]*>[\s\S]*?<\/span>/g,
    (_match, key) => `{{var.${key}}}`
  );
};

export const toEditorVariableHtml = (
  content: string,
  variableMetaMap?: Record<string, { label: string; source: string }>
) => {
  return String(content).replace(VARIABLE_REGEX, (_match, key) => {
    const variableMeta = variableMetaMap?.[key];
    const label = variableMeta?.label ?? getVariableLabel(key);
    const source = variableMeta?.source ?? 'custom';
    const style = getSourceStyle(source);
    return `<span class="ql-variable-tag" data-var-key="${key}" data-var-source="${source}" data-var-label="${label}" contenteditable="false" style="display:inline-block;padding:1px 10px;margin:0 2px;border-radius:10px;border:1px solid ${style.color};background-color:${style.bgColor};color:${style.color};font-size:12px;line-height:20px;">${label}</span>`;
  });
};
