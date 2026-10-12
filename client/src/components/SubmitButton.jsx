function SubmitButton({ isSubmitting, submittingText, children }) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 mt-4 disabled:opacity-50"
    >
      {isSubmitting ? submittingText : children}
    </button>
  );
}

export default SubmitButton;
