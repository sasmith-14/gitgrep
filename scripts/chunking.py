from markdown_it import MarkdownIt


def plain_inline(token):
    if token.type in {"text", "code_inline"}:
        return token.content
    if token.type in {"softbreak", "hardbreak"}:
        return " "
    return "".join(plain_inline(child) for child in (token.children or [])) if token.type != "image" else ""


def sections(markdown):
    tokens = MarkdownIt("commonmark").parse(markdown[:200_000])
    headings, body = [], []
    path = "Introduction"
    skip_section = False
    for i, token in enumerate(tokens):
        if token.type == "heading_open":
            if body:
                yield path, "\n".join(body)
                body = []
            level = int(token.tag[1])
            title = plain_inline(tokens[i + 1]).strip()
            headings = [(depth, title) for depth, title in headings if depth < level] + [(level, title)]
            path = " / ".join(title for _, title in headings)
            skip_section = title.casefold() in {"contents", "table of contents", "toc"}
        elif token.type == "inline" and (i == 0 or tokens[i - 1].type != "heading_open"):
            children = token.children or []
            links = [t.attrGet("href") or "" for t in children if t.type == "link_open"]
            if skip_section or (links and all(x.startswith("#") for x in links)):
                continue
            text = plain_inline(token).strip()
            if text:
                body.append(text)
        elif token.type in {"fence", "code_block"} and not skip_section:
            body.append(token.content.strip())
    if body:
        yield path, "\n".join(body)


def chunk_readme(markdown, tokenizer, size=220, overlap=32):
    if size <= overlap or overlap < 0:
        raise ValueError("chunk size must exceed overlap")
    chunks = []
    for heading, text in sections(markdown):
        tokens = tokenizer.encode(text, add_special_tokens=False, verbose=False)
        for start in range(0, len(tokens), size - overlap):
            passage = tokenizer.decode(tokens[start:start + size], skip_special_tokens=True).strip()
            if passage:
                chunks.append({"heading": heading, "body": passage})
            if start + size >= len(tokens):
                break
    return chunks
