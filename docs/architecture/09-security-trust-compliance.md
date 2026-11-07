# 09 · Security, trust & compliance

## 9.1 Threat model (STRIDE summary)

```mermaid
flowchart LR
  subgraph Assets
    A1["Identity & CIN documents"]
    A2["Money / ledger"]
    A3["Location data"]
    A4["Provider reputation"]
    A5["Chat content"]
  end
  subgraph Threats
    T1["Account takeover (SIM swap, OTP phishing)"]
    T2["Fake providers / identity fraud"]
    T3["Payment fraud, chargebacks, cash non-remittance"]
    T4["Review manipulation, collusion"]
    T5["Off-platform leakage (fee avoidance)"]
    T6["Customer/provider physical safety"]
    T7["Data breach"]
    T8["Scraping of provider data"]
  end
  T1 --> A1 & A2
  T2 --> A4 & A1
  T3 --> A2
  T4 --> A4
  T5 --> A2
  T6 --> A3
  T7 --> A1 & A3 & A5
  T8 --> A3
```

## 9.2 Controls

| Threat | Controls |
|---|---|
| Account takeover | OTP rate-limits per phone/device/IP, device binding, step-up for payout changes, session list + remote revoke, optional passkey/PIN |
| Fake providers | KYC tiers, liveness + face-match, CIN OCR cross-check, duplicate-document detection, manual review for high-risk categories |
| Payment fraud | 3-D Secure, velocity rules, device fingerprint, new-account limits, cash-debt caps, delayed payouts for new providers |
| Review manipulation | Only completed bookings can review, graph analysis for collusion rings, text moderation, review response window |
| Off-platform leakage | Chat masking of phone numbers/IBAN, in-app calling proxies, perks for staying on-platform (insurance, dispute protection, loyalty) |
| Physical safety | Share-my-job link, SOS button with ops escalation, tiered KYC for home entry, rate limits for first jobs, two-way ratings with safety flags |
| Data breach | Encryption in transit (TLS 1.3) and at rest, field-level encryption for CIN numbers, KMS-held keys, least-privilege IAM, secrets vault, break-glass access with audit |
| Scraping | Auth-gated detail endpoints, rate limiting, location fuzzing, bot detection at the edge |
| App security | OWASP MASVS L1, certificate pinning (optional), jailbreak/root signals, secure storage for tokens |
| Supply chain | Dependabot/Renovate, lockfiles, SBOM, signed images, CI secret scanning |

## 9.3 Access control model

```mermaid
flowchart LR
  subgraph Actors
    CU["customer"]
    PRV["provider"]
    ST["staff roles"]
  end
  subgraph Policy["Policy engine (CASL-style)"]
    R1["owner rules: only my bookings"]
    R2["participant rules: booking parties see each other's limited data"]
    R3["role rules: staff by permission"]
    R4["state rules: transition allowed in this state"]
  end
  CU & PRV --> R1 & R2 & R4
  ST --> R3 & R4
  Policy --> AUD["Audit log (immutable)"]
```

## 9.4 Privacy & compliance (Morocco)

- **Law 09-08** on personal data protection and the **CNDP**: declare/obtain authorisation for processing, explicit consent, purpose limitation, data-subject rights (access, rectification, deletion), restrictions on transfers abroad. *Needs legal review before launch; this pack is not legal advice.*
- **Data residency:** prefer hosting in the EU or Morocco with documented safeguards; keep KYC documents in a dedicated store with short retention.
- **Payments:** card data never touches Hawma servers (hosted payment page/SDK) → PCI SAQ-A scope. Provider payouts and wallet balances may fall under Bank Al-Maghrib rules on payment services — **verify licensing needs (e.g., partner with a licensed payment institution)** before holding customer funds.
- **Provider status:** clarify auto-entrepreneur / tax rules, receipts (invoices for fees), VAT on platform fees.
- **Consumer protection:** clear pricing, cancellation terms, dispute process, T&Cs in Arabic and French.
- **Minors & sensitive categories:** childcare and elder-care require Tier 2+ and stricter review.

## 9.5 Trust & safety operations

```mermaid
flowchart LR
  SIG["Signals<br/>reports · low ratings · risk rules · chat flags"] --> TRI["Triage queue"]
  TRI --> L1["L1 support (SLA 1 h)"]
  L1 -->|resolved| CLS["Close + feedback"]
  L1 -->|safety / fraud| L2["Trust & Safety analyst"]
  L2 --> ACT{"Action"}
  ACT --> W["Warn"]
  ACT --> SU["Suspend"]
  ACT --> BN["Ban + device block"]
  ACT --> LE["Escalate to authorities"]
  ACT --> RF["Refund / compensation"]
  W & SU & BN & LE & RF --> AUD2["Audit + model feedback"]
```
