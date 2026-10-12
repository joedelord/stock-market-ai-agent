import PasswordInput from "./PasswordInput";

function FormField({ id, label, className = "", type, ...inputProps }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id}>{label}</label>

      {type === "password" ? (
        <PasswordInput id={id} className="border rounded p-1" {...inputProps} />
      ) : (
        <input
          id={id}
          type={type}
          className="border rounded p-1"
          {...inputProps}
        />
      )}
    </div>
  );
}

export default FormField;
