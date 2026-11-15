# WordPress plugin

`feednotice-subscribe/` is a WordPress plugin that adds a "Get updates by email" link or button
pointing to a FeedNotice-based service: after each post, in a widget, or with the
`[feednotice_subscribe]` shortcode. It adds no script, stylesheet, cookie or form to the site.
The service address is empty by default; nothing is shown until the site owner sets it.

- What it does and its settings: [feednotice-subscribe/readme.txt](feednotice-subscribe/readme.txt)
  (the WordPress.org format).
- The link it builds is the one in [docs/for-publishers.md](../../docs/for-publishers.md);
  the button has the same look as the one `/publishers` prepares.

## Install by hand

```sh
cd integrations/wordpress && zip -r feednotice-subscribe.zip feednotice-subscribe
```

then Plugins → Add New → Upload Plugin.

## Test

```sh
php integrations/wordpress/tests/run.php
```

The tests stub the few WordPress functions the plugin calls and check the HTML it produces:
escaping, the feed chosen, the language, the button's contrast, the settings' sanitising. CI
runs them on PHP 7.4 and 8.3. Before a release, also try it in a real WordPress (for example
[WordPress Playground](https://wordpress.github.io/wordpress-playground/)).
