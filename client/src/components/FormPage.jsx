function FormPage({ title, children }) {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold mb-5 text-center">{title}</h1>

      <div className="w-full max-w-md bg-gray-50 mx-auto p-5 rounded border-2">
        {children}
      </div>
    </main>
  );
}

export default FormPage;
