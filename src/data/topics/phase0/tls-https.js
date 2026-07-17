export default {
  id: 'tls-https',
  title: 'TLS & HTTPS',
  subtitle: 'Certificates, the handshake, and where encryption terminates in your architecture',
  days: 2,
  content: `
## Why this matters for system design

Every production system speaks HTTPS. In interviews, TLS shows up in three places: **latency budgets** (handshakes cost round trips), **architecture decisions** (where do you terminate TLS — at the load balancer? re-encrypt to backends?), and **security questions** (how do clients know they're talking to the real server?).

## The two problems TLS solves

1. **Privacy**: nobody between you and the server can read the traffic (encryption).
2. **Authenticity**: you're really talking to \`yourbank.com\`, not an attacker in the middle (certificates).

Encryption without authenticity is useless — you'd have a perfectly private conversation *with the attacker*.

## Public-key crypto in 60 seconds

- A **key pair**: what one key encrypts, only the other can decrypt.
- The server publishes its **public key**; keeps its **private key** secret.
- Anyone can encrypt a message to the server; only the server can read it.
- The reverse direction gives **signatures**: the server "signs" with its private key, and anyone can verify with the public key.

Asymmetric crypto is slow, so TLS uses it only to **agree on a shared symmetric key** (key exchange), then encrypts the actual traffic with fast symmetric crypto (AES).

## Certificates — the trust chain

How do you know the public key you received actually belongs to \`yourbank.com\`? Certificates:

\`\`\`mermaid
flowchart TB
  R["Root CA — pre-installed in your OS / browser"] -->|signs| I["Intermediate CA"]
  I -->|signs| L["yourbank.com certificate — domain, public key, expiry"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class L accent
\`\`\`

Your device ships with ~150 trusted **root certificate authorities**. The server presents its cert + intermediates; your browser verifies the signature chain up to a trusted root, checks the domain matches, and checks expiry. Fail any check → the scary browser warning.

- **Let's Encrypt** made certs free and automated (ACME protocol) — this is what most infra uses.
- Certificates expire (~90 days for Let's Encrypt); expired-cert outages are embarrassingly common. Automate renewal.

## The TLS handshake (TLS 1.3)

After the TCP handshake, before application data:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant S as Server
  Note over C,S: Runs after the TCP handshake
  C->>S: ClientHello — supported versions, ciphers, key share
  S-->>C: ServerHello + certificate — chosen cipher, key share
  Note over C,S: Both sides derive the shared symmetric key
  C->>S: Finished
  S-->>C: Finished
  Note over C,S: Encrypted application data — 1 RTT total (TLS 1.3)
\`\`\`

- **TLS 1.3: 1 round trip** (older TLS 1.2: 2 round trips). With TCP's handshake, a cold HTTPS connection = **2 RTTs minimum** before the first byte.
- **Session resumption / 0-RTT**: returning clients can resume with zero handshake round trips (QUIC/TLS 1.3), at the cost of some replay-attack nuance.

## Where TLS terminates — the architecture question

> "Terminate" = the point where TLS is decrypted.

| Pattern | How it works | Trade-off |
|---|---|---|
| **Edge/LB termination** | TLS ends at the load balancer; plain HTTP to backends | Simple, centralizes certs, lets LB read HTTP for routing — but internal traffic is plaintext |
| **Re-encryption** | LB terminates, then opens new TLS to backends | Common in regulated industries; more CPU/latency |
| **End-to-end / passthrough** | LB forwards encrypted bytes (L4); backend terminates | LB can't read HTTP (no path routing); maximum secrecy |
| **mTLS (mutual TLS)** | Both sides present certificates | Standard for service-to-service auth in zero-trust networks / service meshes |

The default pattern — terminate at the load balancer, then use a private network or mTLS for the internal hops — looks like this:

\`\`\`mermaid
flowchart LR
  U["Client"] -->|HTTPS / TLS| LB["Load balancer — TLS terminates here"]
  LB -->|HTTP on private net, or mTLS| A1["App server"]
  LB -->|HTTP on private net, or mTLS| A2["App server"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class LB accent
\`\`\`

**Default interview answer:** terminate at the load balancer (it needs to read paths/headers for routing anyway), use mTLS or a private network for internal hops, mention re-encryption if the domain is sensitive (payments, health).

## Performance notes for your latency budget

- Handshake cost: ~1 extra RTT (TLS 1.3). Cross-region, that's 50–150 ms on first connect — another reason for connection pooling and keep-alive.
- Symmetric encryption is nearly free on modern CPUs (AES hardware instructions) — don't let anyone tell you HTTPS is "too slow" for internal use.
- CDNs terminate TLS at the edge near users, so the expensive handshake happens over a *short* distance while the CDN maintains warm connections to your origin.

## How this shows up in interviews

- Drawing the entry path: "TLS terminates at the ALB; certs come from ACM/Let's Encrypt with auto-renewal."
- "How do services authenticate each other?" → mTLS via a service mesh, or signed tokens.
- Latency estimation: cold connection = DNS + TCP (1 RTT) + TLS (1 RTT) + request (1 RTT) ≈ 3–4 RTTs before first byte.
`,
  resources: [
    {
      title: 'SSL, TLS, HTTPS Explained',
      url: 'https://www.youtube.com/watch?v=j9QmMEWmcfo',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'What happens in a TLS handshake?',
      url: 'https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/',
      type: 'article',
      source: 'Cloudflare Learning Center',
    },
    {
      title: 'Illustrated TLS 1.3 connection (every byte explained)',
      url: 'https://tls13.xargs.org/',
      type: 'interactive',
      source: 'xargs.org',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'TLS & HTTPS check',
      questions: [
        {
          q: 'Why does TLS use slow asymmetric crypto ONLY at the start, then switch to symmetric crypto?',
          options: [
            'Symmetric crypto is more secure',
            'Asymmetric solves key exchange over an untrusted channel; symmetric (AES) then encrypts bulk data ~1000× faster',
            'Certificates only work with symmetric keys',
            'Browsers cannot do asymmetric crypto for large data',
          ],
          answer: 1,
          explanation:
            'Asymmetric crypto lets two strangers agree on a secret in public — but it’s computationally expensive. Once both sides share a symmetric key, hardware-accelerated AES handles the traffic essentially for free.',
        },
        {
          q: 'How does your browser know the certificate for yourbank.com is genuine?',
          options: [
            'It asks yourbank.com to confirm',
            'The certificate is signed by a chain leading to a root CA already trusted by your OS/browser, and the domain + expiry check out',
            'All certificates on port 443 are trusted automatically',
            'It compares the certificate against a blockchain',
          ],
          answer: 1,
          explanation:
            'Trust is bootstrapped from ~150 pre-installed root CAs. The presented chain must verify cryptographically up to one of them, match the domain, and be unexpired. Break any link → warning page.',
        },
        {
          q: 'A cold HTTPS request to a server 100ms away (RTT) takes roughly how long before the FIRST response byte (TLS 1.3)?',
          options: ['~100 ms', '~200 ms', '~300–400 ms', '~1 second'],
          answer: 2,
          explanation:
            'TCP handshake (1 RTT) + TLS 1.3 handshake (1 RTT) + request/response (1 RTT) ≈ 3 RTTs ≈ 300 ms, plus DNS if uncached. This is exactly why connection reuse and edge termination matter.',
        },
        {
          q: 'Your L7 load balancer must route /api/video to one service and /api/chat to another. Which TLS pattern is REQUIRED?',
          options: [
            'TLS passthrough (L4)',
            'TLS termination at (or before) the load balancer, so it can read the HTTP path',
            'No TLS at all',
            'mTLS between browser and backend',
          ],
          answer: 1,
          explanation:
            'Path-based routing needs to read the HTTP request, which is impossible while it’s still encrypted. Terminate at the LB, then forward (optionally re-encrypted) to backends.',
        },
        {
          q: 'What is mTLS and where is it typically used?',
          options: [
            'A faster version of TLS for mobile',
            'Both client and server present certificates to authenticate each other — standard for service-to-service traffic in zero-trust architectures',
            'TLS with multiple certificates for multiple domains',
            'A deprecated TLS version',
          ],
          answer: 1,
          explanation:
            'Regular TLS authenticates only the server. mTLS makes the client prove its identity too — this is how services in a mesh (Istio/Linkerd) authenticate each other without passwords.',
        },
        {
          q: 'Your site went down with "certificate expired" despite no code changes. The systemic fix is:',
          options: [
            'Buy a 10-year certificate',
            'Automate issuance and renewal (e.g. ACME/Let’s Encrypt or cloud-managed certs) with expiry monitoring/alerts',
            'Switch to HTTP',
            'Pin the certificate in the client',
          ],
          answer: 1,
          explanation:
            'Cert expiry outages are an ops process failure. Modern practice: short-lived auto-renewed certs (ACME) + alerting well before expiry. Long-lived manual certs just make the failure rarer and bigger.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Inspect real certificates and handshakes',
      intro: 'Poke at production TLS with tools already on your Mac.',
      steps: [
        {
          instruction: 'Watch the TLS handshake narration and find: the TLS version, the cipher, and the certificate chain.',
          command: 'curl -v https://github.com -o /dev/null 2>&1 | grep -E "TLS|SSL|certificate|issuer|subject" | head -15',
          expected: 'TLSv1.3, the cipher suite, subject (github.com) and issuer (an intermediate CA) lines — the chain in action.',
        },
        {
          instruction: 'Dump a site’s full certificate chain and check who signed what.',
          command: 'openssl s_client -connect google.com:443 -showcerts </dev/null 2>/dev/null | grep -E "s:|i:"',
          expected: 's: (subject) and i: (issuer) pairs. The leaf’s issuer = intermediate’s subject; intermediate’s issuer = a root CA.',
        },
        {
          instruction: 'Check certificate expiry dates (how DevOps monitors this).',
          command: 'echo | openssl s_client -connect wikipedia.org:443 2>/dev/null | openssl x509 -noout -dates',
          expected: 'notBefore and notAfter dates. Note how short the validity window is — automation is mandatory.',
        },
        {
          instruction: 'Measure the TLS handshake cost directly: compare time_connect (TCP done) vs time_appconnect (TLS done).',
          command: `curl -so /dev/null -w 'tcp_done=%{time_connect}s tls_done=%{time_appconnect}s\\n' https://example.com`,
          expected: 'tls_done − tcp_done ≈ 1 RTT: the pure price of the TLS handshake.',
        },
        {
          instruction: 'See how many root CAs your system trusts.',
          command: 'security find-certificate -a /System/Library/Keychains/SystemRootCertificates.keychain | grep -c labl',
          expected: 'Roughly 100–200 — every one is an organization your machine implicitly trusts to vouch for any website.',
        },
      ],
    },
  ],
}
