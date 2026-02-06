/**
 * Terms of Service Page
 * Terms and conditions for using Pictures
 */

import { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const BASE_URL = "https://pictures.london";
const CONTACT_EMAIL = "jdwbarge@gmail.com";
const LAST_UPDATED = "31 December 2024";

export const metadata: Metadata = {
  title: "Terms of Service - Pictures",
  description:
    "Terms of service for Pictures, London cinema listings. Read our terms and conditions.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service - Pictures",
    description: "Terms of service for Pictures, London cinema listings.",
    url: `${BASE_URL}/terms`,
    type: "website",
  },
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display text-text-primary mb-2 text-balance">
          Terms of Service
        </h1>
        <p className="text-sm text-text-tertiary mb-8">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="prose prose-invert max-w-none space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              1. Introduction
            </h2>
            <p className="text-text-secondary mb-4">
              Welcome to Pictures. These Terms of Service (&quot;Terms&quot;)
              govern your use of the Pictures website at{" "}
              <a
                href={BASE_URL}
                className="text-accent-primary hover:underline"
              >
                pictures.london
              </a>{" "}
              (&quot;Service&quot;), operated by Pictures (&quot;we&quot;,
              &quot;our&quot;, or &quot;us&quot;).
            </p>
            <p className="text-text-secondary">
              By accessing or using the Service, you agree to be bound by these
              Terms. If you disagree with any part of the Terms, you may not
              access the Service.
            </p>
          </section>

          {/* Description of Service */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              2. Description of Service
            </h2>
            <p className="text-text-secondary mb-4">
              Pictures is a cinema calendar that aggregates film screening
              information from cinemas in London. The Service
              provides:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>Aggregated cinema listings from multiple venues</li>
              <li>Film information and metadata</li>
              <li>Personal watchlist and film tracking features</li>
              <li>Filtering and search functionality</li>
            </ul>
          </section>

          {/* Accuracy Disclaimer */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              3. Accuracy of Information
            </h2>
            <div className="bg-accent-highlight/10 border border-accent-highlight/30 rounded-lg p-4 mb-4">
              <p className="text-accent-highlight-dark font-medium mb-2">
                Important Disclaimer
              </p>
              <p className="text-text-secondary text-sm">
                While we strive to provide accurate and up-to-date information,
                screening times and availability are sourced from third-party
                cinema websites and may change without notice.{" "}
                <strong>
                  Always verify showtimes on the cinema&apos;s official website
                  before travelling or booking tickets.
                </strong>
              </p>
            </div>
            <p className="text-text-secondary">
              We are not responsible for any losses, damages, or inconvenience
              caused by inaccurate or outdated screening information. Cinema
              listings are provided for informational purposes only.
            </p>
          </section>

          {/* User Accounts */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              4. User Accounts
            </h2>
            <p className="text-text-secondary mb-4">
              Some features of the Service require you to create an account. When
              you create an account, you agree to:
            </p>
            <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>
                Accept responsibility for all activities under your account
              </li>
              <li>Notify us immediately of any unauthorised access</li>
            </ul>
            <p className="text-text-secondary">
              We reserve the right to suspend or terminate accounts that violate
              these Terms or for any other reason at our discretion.
            </p>
          </section>

          {/* Acceptable Use */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              5. Acceptable Use
            </h2>
            <p className="text-text-secondary mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>Violate any applicable laws or regulations</li>
              <li>
                Scrape, crawl, or harvest data without our written permission
              </li>
              <li>
                Attempt to gain unauthorised access to any part of the Service
              </li>
              <li>
                Interfere with or disrupt the Service or its infrastructure
              </li>
              <li>
                Use automated tools to access the Service at excessive rates
              </li>
              <li>Impersonate any person or entity</li>
              <li>
                Use the Service for any commercial purpose without our consent
              </li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              6. Intellectual Property
            </h2>
            <p className="text-text-secondary mb-4">
              The Service and its original content (excluding user-generated
              content and third-party data) are owned by Pictures and are
              protected by copyright, trademark, and other intellectual property
              laws.
            </p>
            <p className="text-text-secondary mb-4">
              Film metadata is provided by{" "}
              <a
                href="https://www.themoviedb.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary hover:underline"
              >
                The Movie Database (TMDB)
              </a>{" "}
              under their API terms of use. Cinema listing information is
              sourced from the respective cinema websites.
            </p>
            <p className="text-text-secondary">
              All trademarks, logos, and cinema names belong to their respective
              owners.
            </p>
          </section>

          {/* Third-Party Links */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              7. Third-Party Links
            </h2>
            <p className="text-text-secondary">
              The Service contains links to third-party websites (cinema booking
              pages, TMDB, etc.). We are not responsible for the content,
              privacy policies, or practices of these third-party sites. We
              encourage you to review the terms and policies of any third-party
              sites you visit.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              8. Limitation of Liability
            </h2>
            <p className="text-text-secondary mb-4">
              To the maximum extent permitted by law, Pictures shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages, including but not limited to:
            </p>
            <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
              <li>Loss of profits, data, or other intangible losses</li>
              <li>
                Missed screenings or wasted journeys due to inaccurate
                information
              </li>
              <li>
                Any damages resulting from your use or inability to use the
                Service
              </li>
              <li>Unauthorised access to or alteration of your data</li>
            </ul>
            <p className="text-text-secondary">
              The Service is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, either express or
              implied.
            </p>
          </section>

          {/* Indemnification */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              9. Indemnification
            </h2>
            <p className="text-text-secondary">
              You agree to defend, indemnify, and hold harmless Pictures and its
              operators from any claims, damages, losses, or expenses (including
              legal fees) arising from your use of the Service or violation of
              these Terms.
            </p>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              10. Changes to Terms
            </h2>
            <p className="text-text-secondary">
              We reserve the right to modify these Terms at any time. We will
              notify users of significant changes by posting the new Terms on
              this page and updating the &quot;Last updated&quot; date. Your
              continued use of the Service after changes constitutes acceptance
              of the new Terms.
            </p>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              11. Termination
            </h2>
            <p className="text-text-secondary">
              We may terminate or suspend your access to the Service immediately,
              without prior notice or liability, for any reason, including
              breach of these Terms. Upon termination, your right to use the
              Service will cease immediately.
            </p>
          </section>

          {/* Governing Law */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              12. Governing Law
            </h2>
            <p className="text-text-secondary">
              These Terms shall be governed by and construed in accordance with
              the laws of England and Wales. Any disputes relating to these
              Terms or the Service shall be subject to the exclusive
              jurisdiction of the courts of England and Wales.
            </p>
          </section>

          {/* Severability */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              13. Severability
            </h2>
            <p className="text-text-secondary">
              If any provision of these Terms is found to be unenforceable or
              invalid, that provision will be limited or eliminated to the
              minimum extent necessary, and the remaining provisions will remain
              in full force and effect.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              14. Contact Us
            </h2>
            <p className="text-text-secondary">
              If you have any questions about these Terms, please contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-accent-primary hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        {/* Link to Privacy Policy */}
        <div className="mt-12 pt-8 border-t border-border-subtle">
          <p className="text-text-tertiary text-sm">
            Please also review our{" "}
            <Link
              href="/privacy"
              className="text-accent-primary hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            which describes how we collect and use your information.
          </p>
        </div>
      </div>
    </div>
  );
}
