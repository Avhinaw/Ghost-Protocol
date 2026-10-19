import { Link } from "wouter";

export function EnterVaultButton() {
  return (
    <Link href="/create" className="enter-vault" aria-label="Enter the vault and create a new vault">
      <span className="enter-vault-ring enter-vault-ring-outer" aria-hidden="true" />
      <span className="enter-vault-ring enter-vault-ring-inner" aria-hidden="true" />
      <span className="enter-vault-glow" aria-hidden="true" />
      <span className="enter-vault-copy">
        <span>Enter the vault</span>
        <span className="enter-vault-arrow" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
