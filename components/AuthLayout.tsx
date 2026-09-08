import Link from "next/link";
import {
  BrainCircuit,
  GitBranch,
  Sparkles,
  Award,
  ArrowLeft,
  Network,
  Target
} from "lucide-react";

const FEATURES = [
  {
    icon: GitBranch,
    title: "Skill dependency intelligence",
    text: "Your learning sequence follows real prerequisites."
  },
  {
    icon: BrainCircuit,
    title: "AI-personalized recommendations",
    text: "Recommendations adapt to your goals, skills and progress."
  },
  {
    icon: Award,
    title: "Evidence-based progress",
    text: "Milestones show what you can actually demonstrate."
  }
];

export function AuthLayout({
  children,
  title,
  subtitle
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <main className="auth-page" id="main">

      {/* Background */}
      <div className="auth-background">
        <div className="auth-grid" />
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />
        <div className="auth-glow auth-glow-three" />

        <div className="network network-one">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="network network-two">
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* Top bar */}
      <header className="auth-topbar">
        <Link href="/" className="auth-logo">
          <span>SkillForge</span>
        </Link>

        <Link href="/" className="back-home">
          <ArrowLeft size={15} />
          Back to home
        </Link>
      </header>

      <div className="auth-content">

        {/* LEFT SIDE */}
        <section className="auth-left">

          <div className="auth-badge">
            <Sparkles size={14} />
            <span>PERSONALIZED LEARNING</span>
          </div>

          <h1 className="auth-title">
            {title}
          </h1>

          <p className="auth-subtitle">
            {subtitle}
          </p>

          <div className="auth-form-wrapper">
            {children}
          </div>

          <div className="privacy-note">
            <span className="privacy-dot" />
            Your learning profile stays private and under your control.
          </div>
        </section>

        {/* RIGHT SIDE */}
        <section className="auth-visual">

          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-orbit orbit-three" />

          <div className="floating-node node-a">
            <Network size={18} />
          </div>

          <div className="floating-node node-b">
            <Target size={18} />
          </div>

          <div className="floating-node node-c">
            <BrainCircuit size={19} />
          </div>

          <div className="ai-card">

            <div className="ai-card-header">
              <div className="ai-icon">
                <BrainCircuit size={22} />
              </div>

              <div>
                <div className="ai-label">
                  YOUR AI LEARNING SYSTEM
                </div>

                <h2>
                  Learn with a path
                  <br />
                  built around you.
                </h2>
              </div>
            </div>

            <div className="ai-description">
              SkillForge understands where you are,
              where you want to go, and builds the
              sequence in between.
            </div>

            <div className="feature-list">

              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;

                return (
                  <div className="feature-item" key={feature.title}>

                    <div className="feature-number">
                      0{index + 1}
                    </div>

                    <div className="feature-icon">
                      <Icon size={18} />
                    </div>

                    <div className="feature-content">
                      <h3>{feature.title}</h3>
                      <p>{feature.text}</p>
                    </div>

                  </div>
                );
              })}

            </div>

            <div className="ai-status">
              <div className="status-pulse" />

              <div>
                <span>AI ENGINE</span>
                <strong>Continuously personalizing</strong>
              </div>

              <div className="status-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>

          </div>
        </section>
      </div>
    </main>
  );
}