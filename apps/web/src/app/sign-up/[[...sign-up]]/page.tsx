import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      padding: 24,
      background: `
        radial-gradient(ellipse 70% 50% at 50% 0%, rgba(109, 40, 217, 0.06), transparent 55%),
        var(--cs-bg, #fafafa)
      `,
    }}>
      <SignUp />
    </div>
  );
}
