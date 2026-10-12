import ButtonLink from "../components/ButtonLink";

function NotFound() {
  return (
    <main className="min-h-screen bg-gray-100 p-8 text-center">
      <h1 className="text-4xl font-bold mb-2">404</h1>

      <p className="mb-5 text-gray-600">Page not found.</p>

      <ButtonLink to="/">Return home</ButtonLink>
    </main>
  );
}

export default NotFound;
