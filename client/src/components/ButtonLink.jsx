import { Link } from "react-router";

function ButtonLink({ to, children, className = "" }) {
  return (
    <Link
      to={to}
      className={`inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 ${className}`}
    >
      {children}
    </Link>
  );
}

export default ButtonLink;
