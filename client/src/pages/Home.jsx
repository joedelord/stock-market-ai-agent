import ButtonLink from "../components/ButtonLink";

import { useAuth } from "../context/useAuth";

function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-center">
      <h1 className="text-4xl font-bold mb-5">Stock Market App</h1>

      {isAuthenticated ? (
        <ButtonLink to="/stocks" className="text-xl block w-fit mx-auto">
          Open my stocks
        </ButtonLink>
      ) : (
        <div className="flex justify-center gap-3">
          <ButtonLink to="/login">Login</ButtonLink>

          <ButtonLink to="/register">Create account</ButtonLink>
        </div>
      )}
    </main>
  );
}

export default Home;
