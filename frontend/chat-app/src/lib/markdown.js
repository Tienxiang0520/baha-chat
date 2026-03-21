import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const markdownParser = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true
});

export function renderMessageHtml(text, useMarkdown = true) {
  const source = String(text ?? '');

  if (!useMarkdown) {
    return DOMPurify.sanitize(source);
  }

  const lockPlaceholders = [];
  const prepared = source.replace(/\[lock:(.*?)\]([\s\S]*?)\[\/lock\]/g, (match, password, content) => {
    const key = `__LOCKED_${lockPlaceholders.length}__`;
    lockPlaceholders.push({
      key,
      password,
      encodedContent: encodeURIComponent(content)
    });
    return key;
  });

  const rendered = markdownParser.render(prepared);
  let sanitized = DOMPurify.sanitize(rendered, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'type', 'id']
  });

  lockPlaceholders.forEach(({ key, password, encodedContent }) => {
    sanitized = sanitized.replace(
      key,
      `<div class="locked-message">
        <div class="locked-message__title">🔒 加密訊息</div>
        <div class="locked-message__body">
          <input class="locked-message__input" type="password" placeholder="輸入密碼" />
          <button class="locked-message__button" type="button" data-lock-password="${password}" data-lock-content="${encodedContent}">解鎖</button>
        </div>
      </div>`
    );
  });

  return sanitized;
}
