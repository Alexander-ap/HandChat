function cleanWord(value: string) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").trim();
}

export function appendRecognizedWord(params: {
  prevText: string;
  newWord: string;
  placeholderText?: string;
}) {
  const word = cleanWord(params.newWord);
  if (!word) return params.prevText;

  if (params.placeholderText && params.prevText === params.placeholderText) {
    return word;
  }

  const words = params.prevText.split(" ").filter(Boolean);
  if (words.length > 0 && words[words.length - 1] === word) {
    return params.prevText;
  }

  return params.prevText ? `${params.prevText} ${word}` : word;
}

