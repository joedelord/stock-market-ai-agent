// The emails come from a Gmail address, which spam filters trust less than a
// verified company domain. Marking one as not spam teaches the filter.
export default function SpamFolderHint({ className = "", children }) {
  return (
    <p className={`text-sm text-gray-500 ${className}`}>
      {children ?? (
        <>
          Can&apos;t find the email? Check your spam or junk folder. If it is
          there, mark it as not spam so the next ones reach your inbox.
        </>
      )}
    </p>
  );
}
