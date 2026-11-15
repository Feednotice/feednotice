=== Subscribe by Email (FeedNotice) ===
Contributors: feednotice
Tags: email, subscribe, rss, feed, newsletter
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: AGPL-3.0-or-later
License URI: https://www.gnu.org/licenses/agpl-3.0.html

Let readers follow your site by email through a FeedNotice-based service. A link or a button, with no script and no form, and nothing collected on your site.

== Description ==

FeedNotice is open-source software that emails the new posts of any feed to the people who asked for them, with double opt-in and without tracking. This plugin adds a "Get updates by email" link to your site that points to a FeedNotice-based service you choose.

* **After each post**, automatically, if you switch it on.
* **A widget** for your sidebar or footer. On a category, tag or author page, it can follow that page's feed.
* **A shortcode** for any post, page or Shortcode block: `[feednotice_subscribe]`.
* **A link styled by your theme, or a button** in your colour. The text colour is chosen for contrast.
* **Your readers' language**: the subscribe page and the emails follow your site's language when the service offers it.

The plugin adds no script, no stylesheet, no cookie and no form to your site. Readers enter their address on the service, not on your site, so the plugin stores no personal data.

= Shortcode =

`[feednotice_subscribe]` uses the settings. Attributes:

* `feed`: `posts`, `comments`, `current` (the category, tag or author page being shown) or a feed address
* `style`: `link` or `button`
* `text`: the link's text
* `color`: the button's colour, e.g. `#1d4ed8`

== Installation ==

1. Install and activate the plugin.
2. Go to Settings → Subscribe by email and enter the service's address, for example `https://service.example`. Nothing is shown until you do.
3. Switch on "After each post", add the widget, or place the shortcode.

== External services ==

When a reader follows the link, their browser goes to the service you set in Settings. The link carries the address of your feed and, unless you turn it off, the language of your site. Nothing is sent by your site itself, and nothing is sent if no reader follows the link. The service's own terms and privacy policy apply there; they are linked from every page of the service.

== Frequently Asked Questions ==

= Which service should I use? =

Any service running FeedNotice. The software is open source and you can run your own: https://github.com/Feednotice/feednotice

= Does it slow my site down? =

No. It adds one link to the page, with no script and no request to another site.

= What if my feed is not the default one? =

Choose "Another feed" in the settings, or give the address in the shortcode: `[feednotice_subscribe feed="https://example.org/news/feed/"]`.

== Changelog ==

= 1.0.0 =
* First version: link or button, after each post, widget, shortcode, readers' language.
