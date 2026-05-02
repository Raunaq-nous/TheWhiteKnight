"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { getProfile, saveProfile, getSeedProfile, Profile } from "../../lib/profile";

function ContactLink({ href, label }: { href: string; label: string }) {
  const url = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", textDecoration: "none" }}>
      {label}
    </a>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div className="label">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let p = getProfile();
    if (!p) {
      // First launch: load seed profile
      p = getSeedProfile();
      saveProfile(p);
    }
    setProfile(p);
    setLoading(false);

    const handler = () => setProfile(getProfile());
    window.addEventListener("careeros-profile-change", handler);
    return () => window.removeEventListener("careeros-profile-change", handler);
  }, []);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <div style={{ padding: 64, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>LOADING...</div>
      <Footer />
    </div>
  );

  if (!profile) return null;

  const editLink = <Link href="/profile/edit/" className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px", textDecoration: "none" }}>EDIT</Link>;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>

        {/* Hero */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "1.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em", marginBottom: 8 }}>
                {profile.name}
              </h1>
              <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 16, maxWidth: 680 }}>
                {profile.headline}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {profile.email && <span className="label">{profile.email}</span>}
                {profile.phone && <span className="label">{profile.phone}</span>}
                {profile.location && <span className="label">{profile.location}</span>}
                {profile.locationsOpenTo && <span className="label" style={{ color: "var(--text-tertiary)" }}>Open to: {profile.locationsOpenTo}</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                {profile.linkedin && <ContactLink href={profile.linkedin} label="LINKEDIN" />}
                {profile.github && <ContactLink href={profile.github} label="GITHUB" />}
                {profile.portfolio && <ContactLink href={profile.portfolio} label="PORTFOLIO" />}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
              <Link href="/profile/edit/" className="btn btn-primary" style={{ textDecoration: "none", padding: "10px 20px" }}>EDIT PROFILE</Link>
              <span className="label" style={{ color: "var(--text-tertiary)", fontSize: "0.625rem" }}>UPDATED {profile.updatedAt?.split("T")[0]}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          {/* Left column */}
          <div>
            {/* Experience */}
            <SectionCard title="EXPERIENCE" action={editLink}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {profile.experience.map(exp => (
                  <div key={exp.id} style={{ paddingBottom: 20, borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "0.9375rem", textTransform: "uppercase" }}>
                          {exp.company}
                          {exp.current && <span className="pill pill-offer" style={{ marginLeft: 8, fontSize: "0.5rem" }}>CURRENT</span>}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 2 }}>{exp.role}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="label" style={{ fontSize: "0.625rem" }}>{exp.tenure}</div>
                        <div className="label" style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>{exp.location}</div>
                      </div>
                    </div>
                    {exp.bullets && (
                      <ul style={{ margin: "10px 0 0 0", paddingLeft: 18, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                        {exp.bullets.split("\n").filter(b => b.trim()).map((b, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>{b.trim()}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Projects */}
            <SectionCard title={`PROJECTS & BUILDS (${profile.projects.length})`} action={editLink}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {profile.projects.map(proj => (
                  <div key={proj.id} style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)", borderRadius: "var(--radius)", padding: 16 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>{proj.name}</div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>{proj.description}</p>
                    <div className="label" style={{ fontSize: "0.6rem", color: "var(--text-tertiary)", marginBottom: 6 }}>{proj.stack}</div>
                    {proj.repoUrl && (
                      <a href={`https://${proj.repoUrl}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: "var(--accent)", fontSize: "0.625rem", fontFamily: "var(--font-mono)", textDecoration: "none" }}>
                        VIEW REPO →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Right column */}
          <div>
            {/* Skills */}
            <SectionCard title="SKILLS" action={editLink}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {Object.entries(profile.skills).map(([category, skills]) => (
                  <div key={category}>
                    <div className="label" style={{ fontSize: "0.625rem", marginBottom: 6 }}>{category.toUpperCase()}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {skills.split(",").map(s => s.trim()).filter(Boolean).map(skill => (
                        <span key={skill} style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 2, padding: "2px 8px", fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Education */}
            <SectionCard title="EDUCATION" action={editLink}>
              {profile.education.map(edu => (
                <div key={edu.id}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "0.875rem", textTransform: "uppercase" }}>{edu.institution}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: 2 }}>{edu.degree} — {edu.field}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    <span className="label" style={{ fontSize: "0.625rem" }}>{edu.years}</span>
                    {edu.gpa && <span className="label" style={{ fontSize: "0.625rem" }}>GPA: {edu.gpa}</span>}
                  </div>
                  {edu.achievements && (
                    <ul style={{ margin: "8px 0 0 0", paddingLeft: 16, fontSize: "0.75rem", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                      {edu.achievements.split("\n").filter(a => a.trim()).map((a, i) => (
                        <li key={i}>{a.trim()}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </SectionCard>

            {/* Publications */}
            <SectionCard title={`PUBLICATIONS (${profile.publications.length})`} action={editLink}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {profile.publications.map(pub => (
                  <div key={pub.id} style={{ paddingBottom: 10, borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4, marginBottom: 4 }}>{pub.title}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span className="label" style={{ fontSize: "0.6rem", color: "var(--accent)" }}>{pub.publication}</span>
                      <span className="label" style={{ fontSize: "0.6rem" }}>{pub.year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Certifications */}
            <SectionCard title={`CERTIFICATIONS (${profile.certifications.length})`} action={editLink}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.certifications.map(cert => (
                  <div key={cert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 6, borderBottom: "1px solid var(--border-light)" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{cert.name}</div>
                      {cert.issuer && <div className="label" style={{ fontSize: "0.6rem", color: "var(--text-tertiary)" }}>{cert.issuer}</div>}
                    </div>
                    {cert.date && <span className="label" style={{ fontSize: "0.6rem", whiteSpace: "nowrap" }}>{cert.date}</span>}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Voice notes */}
            {profile.voiceNotes && (
              <SectionCard title="VOICE & TONE NOTES" action={editLink}>
                <pre style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", margin: 0 }}>
                  {profile.voiceNotes}
                </pre>
              </SectionCard>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
