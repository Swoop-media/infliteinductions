// app/app/_components/SignOutButton.tsx
export default function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action="/auth/logout" method="post">
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
