<?php
// Tests of the plugin's output, with the few WordPress functions it calls stubbed.
// Run: php integrations/wordpress/tests/run.php

define('ABSPATH', __DIR__);

$GLOBALS['t'] = array('options' => array(), 'locale' => 'en_US', 'page' => 'home', 'singular' => false, 'filters' => array(), 'shortcodes' => array());

class WP_Widget {
	public $id_base = 'feednotice_subscribe';
	public function __construct($id, $name, $opts = array()) {}
}
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['t']['options']) ? $GLOBALS['t']['options'][$k] : $d; }
function get_locale() { return $GLOBALS['t']['locale']; }
function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return htmlspecialchars($s, ENT_QUOTES); }
function esc_html($s) { return htmlspecialchars($s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars($s, ENT_QUOTES); }
function esc_url($u) { return preg_match('#^https?://#', $u) ? str_replace(array('&', '"', "'"), array('&#038;', '&quot;', '&#039;'), $u) : ''; }
function esc_url_raw($u, $p = null) { return preg_match('#^https?://[^\s"<>]+$#', $u) ? $u : ''; }
function sanitize_text_field($s) { return trim(strip_tags($s)); }
function sanitize_hex_color($c) { return preg_match('/^#([a-f0-9]{3}){1,2}$/i', (string) $c) ? $c : null; }
function get_feed_link($f = '') { return 'comments_rss2' === $f ? 'https://blog.example/comments/feed/' : 'https://blog.example/feed/'; }
function get_default_feed() { return 'rss2'; }
function get_term_feed_link($id, $tax) { return "https://blog.example/category/council/feed/"; }
function get_author_feed_link($id) { return "https://blog.example/author/ann/feed/"; }
function get_queried_object() { return (object) array('term_id' => 7, 'taxonomy' => 'category'); }
function get_queried_object_id() { return 3; }
function is_category() { return 'category' === $GLOBALS['t']['page']; }
function is_tag() { return false; }
function is_tax() { return false; }
function is_author() { return 'author' === $GLOBALS['t']['page']; }
function is_singular($t = '') { return $GLOBALS['t']['singular']; }
function in_the_loop() { return true; }
function is_main_query() { return true; }
function shortcode_atts($pairs, $atts, $sc = '') { return array_merge($pairs, array_intersect_key((array) $atts, $pairs)); }
function add_shortcode($n, $f) { $GLOBALS['t']['shortcodes'][$n] = $f; }
function add_filter($n, $f, $p = 10) { $GLOBALS['t']['filters'][$n] = $f; }
function add_action($n, $f) {}
function plugin_basename($f) { return 'feednotice-subscribe/feednotice-subscribe.php'; }

require __DIR__ . '/../feednotice-subscribe/feednotice-subscribe.php';

$failed = 0;
function check($name, $ok) {
	global $failed;
	echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
	if (!$ok) $failed++;
}
function set_options($o) { $GLOBALS['t']['options']['feednotice_subscribe'] = $o; }

// Nothing until the service is set.
check('no service: nothing shown', '' === feednotice_subscribe_html());
check('no service: post unchanged', '<p>x</p>' === feednotice_subscribe_after_post('<p>x</p>'));

set_options(array('service_url' => 'https://service.example'));
$h = feednotice_subscribe_html();
check('link to the posts feed, site language', false !== strpos($h, 'href="https://service.example/s?feed=https%3A%2F%2Fblog.example%2Ffeed%2F&#038;lang=en"'));
check('default English text', false !== strpos($h, '>Get updates by email</a>'));

$GLOBALS['t']['locale'] = 'fr_FR';
check('default French text and lang=fr', false !== strpos(feednotice_subscribe_html(), 'lang=fr">Recevoir les nouveautés par courriel<'));
$GLOBALS['t']['locale'] = 'en_GB';

set_options(array('service_url' => 'https://service.example', 'lang' => 'none', 'feed' => 'comments'));
$h = feednotice_subscribe_html();
check('comments feed, no lang', false !== strpos($h, 'feed=https%3A%2F%2Fblog.example%2Fcomments%2Ffeed%2F"'));

$GLOBALS['t']['page'] = 'category';
check('current: the category feed', false !== strpos(feednotice_subscribe_html(array('feed' => 'current')), 'category%2Fcouncil%2Ffeed'));
$GLOBALS['t']['page'] = 'home';
check('current elsewhere: the posts feed', false !== strpos(feednotice_subscribe_html(array('feed' => 'current')), 'blog.example%2Ffeed%2F"'));

// Escaping of what authors type in a shortcode.
$sc = $GLOBALS['t']['shortcodes']['feednotice_subscribe'];
$h = $sc(array('text' => 'Follow <b>"us"</b>', 'feed' => 'https://other.example/a.xml?x=1&y=2'));
check('shortcode text escaped', false !== strpos($h, '>Follow &lt;b&gt;&quot;us&quot;&lt;/b&gt;</a>'));
check('shortcode feed URL encoded', false !== strpos($h, 'feed=https%3A%2F%2Fother.example%2Fa.xml%3Fx%3D1%26y%3D2'));
check('a feed attribute that is not a URL falls back', false !== strpos($sc(array('feed' => 'javascript:alert(1)')), 'blog.example%2Ffeed%2F'));
check('bad colour ignored', false === strpos($sc(array('style' => 'button', 'color' => 'red;background:url(x)')), 'url(x)'));

// Button: readable text colour on light and dark backgrounds.
set_options(array('service_url' => 'https://service.example/', 'style' => 'button', 'color' => '#ffcc00'));
$h = feednotice_subscribe_html();
check('button on yellow: dark text', false !== strpos($h, 'background:#ffcc00;color:#111111'));
check('trailing slash of the service removed', false !== strpos($h, 'https://service.example/s?feed='));
check('button has the envelope icon', false !== strpos($h, '<svg') && false !== strpos($h, 'aria-hidden="true"'));
check('button on dark blue: white text', false !== strpos(feednotice_subscribe_html(array('color' => '#1d4ed8')), 'color:#ffffff'));

// After each post: only on single posts, when switched on.
set_options(array('service_url' => 'https://service.example', 'auto_insert' => 1));
check('auto insert off the post page: unchanged', '<p>x</p>' === feednotice_subscribe_after_post('<p>x</p>'));
$GLOBALS['t']['singular'] = true;
check('auto insert on a post', false !== strpos(feednotice_subscribe_after_post('<p>x</p>'), '<p class="feednotice-subscribe-after"><a class="feednotice-subscribe"'));
set_options(array('service_url' => 'https://service.example', 'auto_insert' => 0));
check('auto insert switched off', '<p>x</p>' === feednotice_subscribe_after_post('<p>x</p>'));

// Settings sanitising.
$s = feednotice_subscribe_sanitize(array('service_url' => ' https://svc.example/ ', 'feed' => 'evil', 'style' => 'x', 'color' => 'nope', 'lang' => 'DE', 'auto_insert' => 'on', 'text' => '<script>x</script>Hi'));
check('sanitize: service trimmed', 'https://svc.example' === $s['service_url']);
check('sanitize: unknown feed → posts', 'posts' === $s['feed']);
check('sanitize: unknown style → link', 'link' === $s['style']);
check('sanitize: bad colour → default', '#1d4ed8' === $s['color']);
check('sanitize: lang lower-cased', 'de' === $s['lang']);
check('sanitize: checkbox', 1 === $s['auto_insert']);
check('sanitize: tags stripped from text', 'xHi' === $s['text']);
check('sanitize: javascript service refused', '' === feednotice_subscribe_sanitize(array('service_url' => 'javascript:alert(1)'))['service_url']);

echo $failed ? "\n$failed failed\n" : "\nall passed\n";
exit($failed ? 1 : 0);
