/**
 * Settings Page
 * User preferences and hidden films management
 */

import { SubpageNav } from "@/components/layout/subpage-nav";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { NotInterestedList } from "@/components/settings/not-interested-list";
import { CalendarViewSetting } from "@/components/settings/calendar-view-setting";
import { CookieConsentSettings } from "@/components/cookie-consent-banner";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background-primary pb-24">
      <SubpageNav />

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display text-text-primary mb-8 text-balance">Settings</h1>

        {/* Appearance Section - First */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Appearance
          </h2>
          <p className="text-text-secondary text-sm mb-6">
            Choose how Pictures looks.
          </p>

          <ThemeSetting />
        </section>

        {/* Calendar View Section */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Calendar Display
          </h2>
          <p className="text-text-secondary text-sm mb-6">
            Choose how screenings are displayed on the main calendar.
          </p>

          <CalendarViewSetting />
        </section>

        {/* Not Interested Section */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Hidden Films
          </h2>
          <p className="text-text-secondary text-sm mb-6">
            Films you&apos;ve marked as &quot;not interested&quot; are hidden from the calendar.
            Restore them here to see their screenings again.
          </p>

          <NotInterestedList />
        </section>

        {/* Privacy Section */}
        <section className="mb-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Privacy & Cookies
          </h2>
          <p className="text-text-secondary text-sm mb-6">
            Control how we use cookies for analytics.
          </p>

          <CookieConsentSettings />
        </section>
      </div>
    </div>
  );
}

export const metadata = {
  title: "Settings | Pictures",
  description: "Manage your Pictures settings and preferences",
};
