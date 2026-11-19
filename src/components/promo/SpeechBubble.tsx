/** 0034: a pixel speech bubble above a character ("Bean there, aced that!"). Read out politely by screen readers. */
export function SpeechBubble({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`speech-bubble ${className}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}
