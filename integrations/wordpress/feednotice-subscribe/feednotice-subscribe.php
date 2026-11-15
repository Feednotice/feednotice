<?php
/**
 * Plugin Name:       Subscribe by Email (FeedNotice)
 * Plugin URI:        https://github.com/Feednotice/feednotice/tree/main/integrations/wordpress
 * Description:       Lets readers follow your site by email through a FeedNotice-based service: a link or a button after your posts, in a widget or with a shortcode. No script, no form, no data on your site.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * License:           AGPL-3.0-or-later
 * License URI:       https://www.gnu.org/licenses/agpl-3.0.html
 * Text Domain:       feednotice-subscribe
 */

if (!defined('ABSPATH')) {
	exit;
}

const FEEDNOTICE_SUBSCRIBE_OPTION = 'feednotice_subscribe';

/** Settings, with their defaults. The service address is empty until the site owner sets it. */
function feednotice_subscribe_options() {
	$defaults = array(
		'service_url' => '',
		'feed'        => 'posts',   // posts | comments | custom
		'custom_feed' => '',
		'text'        => '',        // empty: the default text in the site's language
		'style'       => 'link',    // link | button
		'color'       => '#1d4ed8',
		'auto_insert' => 0,         // 1: after each post
		'lang'        => 'auto',    // auto (the site's language) | none | en, fr, de, es…
	);
	$saved = get_option(FEEDNOTICE_SUBSCRIBE_OPTION, array());
	return array_merge($defaults, is_array($saved) ? $saved : array());
}

/** Default link text, in the site's language when known. Translations of the admin go through translate.wordpress.org. */
function feednotice_subscribe_default_text() {
	$texts = array(
		'en' => 'Get updates by email',
		'fr' => 'Recevoir les nouveautés par courriel',
		'de' => 'Neuigkeiten per E-Mail erhalten',
		'es' => 'Recibir las novedades por correo electrónico',
	);
	$lang = substr(get_locale(), 0, 2);
	return isset($texts[$lang]) ? $texts[$lang] : __('Get updates by email', 'feednotice-subscribe');
}

/**
 * The feed to follow. $which: posts, comments, custom, a feed URL, or "current" (the feed of the
 * category, tag or author page being shown, else the posts feed).
 */
function feednotice_subscribe_feed_url($which, $options) {
	if ('current' === $which) {
		if (is_category() || is_tag() || is_tax()) {
			$term = get_queried_object();
			if ($term && isset($term->term_id, $term->taxonomy)) {
				return get_term_feed_link($term->term_id, $term->taxonomy);
			}
		} elseif (is_author()) {
			return get_author_feed_link(get_queried_object_id());
		}
		return get_feed_link();
	}
	if ('comments' === $which) {
		return get_feed_link('comments_' . get_default_feed());
	}
	if ('custom' === $which) {
		return $options['custom_feed'] ? $options['custom_feed'] : get_feed_link();
	}
	if (preg_match('#^https?://#i', (string) $which)) {
		return $which;
	}
	return get_feed_link();
}

/** The subscribe address on the service, or '' while no service is set. */
function feednotice_subscribe_url($feed_url, $options) {
	$service = rtrim((string) $options['service_url'], '/');
	if ('' === $service || '' === (string) $feed_url) {
		return '';
	}
	$url = $service . '/s?feed=' . rawurlencode($feed_url);
	$lang = $options['lang'];
	if ('auto' === $lang) {
		$lang = substr(get_locale(), 0, 2);
	}
	if ('none' !== $lang && preg_match('/^[a-z]{2}$/', $lang)) {
		$url .= '&lang=' . $lang;   // a language the service does not have is ignored there
	}
	return $url;
}

/** Text colour readable on the button's background (WCAG relative luminance). */
function feednotice_subscribe_text_color($hex) {
	$lin = function ($c) {
		$c = $c / 255;
		return $c <= 0.04045 ? $c / 12.92 : pow(($c + 0.055) / 1.055, 2.4);
	};
	$r = hexdec(substr($hex, 1, 2));
	$g = hexdec(substr($hex, 3, 2));
	$b = hexdec(substr($hex, 5, 2));
	return 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b) > 0.18 ? '#111111' : '#ffffff';
}

/**
 * The link or button. $args: feed, text, style (link|button), color. Empty when no service is set.
 */
function feednotice_subscribe_html($args = array()) {
	$o     = feednotice_subscribe_options();
	$feed  = isset($args['feed']) && '' !== $args['feed'] ? $args['feed'] : $o['feed'];
	$text  = isset($args['text']) && '' !== $args['text'] ? $args['text'] : ($o['text'] ? $o['text'] : feednotice_subscribe_default_text());
	$style = isset($args['style']) && in_array($args['style'], array('link', 'button'), true) ? $args['style'] : $o['style'];
	$color = isset($args['color']) && sanitize_hex_color($args['color']) ? sanitize_hex_color($args['color']) : $o['color'];

	$href = feednotice_subscribe_url(feednotice_subscribe_feed_url($feed, $o), $o);
	if ('' === $href) {
		return '';
	}
	if ('button' !== $style) {
		return '<a class="feednotice-subscribe" href="' . esc_url($href) . '">' . esc_html($text) . '</a>';
	}
	$css = 'display:inline-flex;align-items:center;gap:.5em;padding:.6em 1.1em;border-radius:6px;background:' . $color
		. ';color:' . feednotice_subscribe_text_color($color) . ';font:600 15px/1.2 system-ui,sans-serif;text-decoration:none';
	$icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
	return '<a class="feednotice-subscribe feednotice-subscribe-button" href="' . esc_url($href) . '" style="' . esc_attr($css) . '">' . $icon . esc_html($text) . '</a>';
}

/* ---- Shortcode: [feednotice_subscribe feed="current" style="button" text="…" color="#…"] ---- */

function feednotice_subscribe_shortcode($atts) {
	$atts = shortcode_atts(array('feed' => '', 'text' => '', 'style' => '', 'color' => ''), $atts, 'feednotice_subscribe');
	return feednotice_subscribe_html($atts);
}
add_shortcode('feednotice_subscribe', 'feednotice_subscribe_shortcode');

/* ---- After each post ---- */

function feednotice_subscribe_after_post($content) {
	$o = feednotice_subscribe_options();
	if (!$o['auto_insert'] || !is_singular('post') || !in_the_loop() || !is_main_query()) {
		return $content;
	}
	$html = feednotice_subscribe_html();
	return '' === $html ? $content : $content . "\n" . '<p class="feednotice-subscribe-after">' . $html . '</p>';
}
add_filter('the_content', 'feednotice_subscribe_after_post', 20);

/* ---- Widget ---- */

class FeedNotice_Subscribe_Widget extends WP_Widget {
	public function __construct() {
		parent::__construct('feednotice_subscribe', __('Subscribe by email', 'feednotice-subscribe'), array(
			'description' => __('A link or a button to follow this site by email.', 'feednotice-subscribe'),
		));
	}

	public function widget($args, $instance) {
		$html = feednotice_subscribe_html(array(
			'feed'  => !empty($instance['current']) ? 'current' : '',
			'style' => isset($instance['style']) ? $instance['style'] : '',
			'text'  => isset($instance['text']) ? $instance['text'] : '',
		));
		if ('' === $html) {
			return;
		}
		echo $args['before_widget'];   // phpcs:ignore WordPress.Security.EscapeOutput -- theme markup
		if (!empty($instance['title'])) {
			echo $args['before_title'] . esc_html(apply_filters('widget_title', $instance['title'], $instance, $this->id_base)) . $args['after_title']; // phpcs:ignore WordPress.Security.EscapeOutput
		}
		echo '<p>' . $html . '</p>';   // phpcs:ignore WordPress.Security.EscapeOutput -- escaped in feednotice_subscribe_html()
		echo $args['after_widget'];    // phpcs:ignore WordPress.Security.EscapeOutput
	}

	public function form($instance) {
		$title   = isset($instance['title']) ? $instance['title'] : '';
		$text    = isset($instance['text']) ? $instance['text'] : '';
		$style   = isset($instance['style']) ? $instance['style'] : '';
		$current = !empty($instance['current']);
		?>
		<p><label for="<?php echo esc_attr($this->get_field_id('title')); ?>"><?php esc_html_e('Title:', 'feednotice-subscribe'); ?></label>
		<input class="widefat" id="<?php echo esc_attr($this->get_field_id('title')); ?>" name="<?php echo esc_attr($this->get_field_name('title')); ?>" type="text" value="<?php echo esc_attr($title); ?>"></p>
		<p><label for="<?php echo esc_attr($this->get_field_id('text')); ?>"><?php esc_html_e('Link text (empty: the default):', 'feednotice-subscribe'); ?></label>
		<input class="widefat" id="<?php echo esc_attr($this->get_field_id('text')); ?>" name="<?php echo esc_attr($this->get_field_name('text')); ?>" type="text" value="<?php echo esc_attr($text); ?>"></p>
		<p><label for="<?php echo esc_attr($this->get_field_id('style')); ?>"><?php esc_html_e('Look:', 'feednotice-subscribe'); ?></label>
		<select id="<?php echo esc_attr($this->get_field_id('style')); ?>" name="<?php echo esc_attr($this->get_field_name('style')); ?>">
			<option value=""<?php selected($style, ''); ?>><?php esc_html_e('As in the settings', 'feednotice-subscribe'); ?></option>
			<option value="link"<?php selected($style, 'link'); ?>><?php esc_html_e('Link', 'feednotice-subscribe'); ?></option>
			<option value="button"<?php selected($style, 'button'); ?>><?php esc_html_e('Button', 'feednotice-subscribe'); ?></option>
		</select></p>
		<p><input type="checkbox" id="<?php echo esc_attr($this->get_field_id('current')); ?>" name="<?php echo esc_attr($this->get_field_name('current')); ?>" value="1"<?php checked($current); ?>>
		<label for="<?php echo esc_attr($this->get_field_id('current')); ?>"><?php esc_html_e('On a category, tag or author page, follow that page\'s feed', 'feednotice-subscribe'); ?></label></p>
		<?php
		return '';
	}

	public function update($new, $old) {
		return array(
			'title'   => sanitize_text_field(isset($new['title']) ? $new['title'] : ''),
			'text'    => sanitize_text_field(isset($new['text']) ? $new['text'] : ''),
			'style'   => isset($new['style']) && in_array($new['style'], array('link', 'button'), true) ? $new['style'] : '',
			'current' => empty($new['current']) ? 0 : 1,
		);
	}
}

add_action('widgets_init', function () {
	register_widget('FeedNotice_Subscribe_Widget');
});

/* ---- Settings: Settings → Subscribe by email ---- */

function feednotice_subscribe_sanitize($in) {
	$in  = is_array($in) ? $in : array();
	$out = feednotice_subscribe_options();

	$service = isset($in['service_url']) ? esc_url_raw(trim($in['service_url']), array('https', 'http')) : '';
	$out['service_url'] = rtrim($service, '/');

	$out['feed']        = isset($in['feed']) && in_array($in['feed'], array('posts', 'comments', 'custom'), true) ? $in['feed'] : 'posts';
	$out['custom_feed'] = isset($in['custom_feed']) ? esc_url_raw(trim($in['custom_feed']), array('https', 'http')) : '';
	$out['text']        = isset($in['text']) ? sanitize_text_field($in['text']) : '';
	$out['style']       = isset($in['style']) && 'button' === $in['style'] ? 'button' : 'link';
	$color              = isset($in['color']) ? sanitize_hex_color($in['color']) : '';
	$out['color']       = $color && 7 === strlen($color) ? $color : '#1d4ed8';
	$out['auto_insert'] = empty($in['auto_insert']) ? 0 : 1;
	$lang               = isset($in['lang']) ? strtolower(sanitize_text_field($in['lang'])) : 'auto';
	$out['lang']        = in_array($lang, array('auto', 'none'), true) || preg_match('/^[a-z]{2}$/', $lang) ? $lang : 'auto';
	return $out;
}

add_action('admin_init', function () {
	register_setting('feednotice_subscribe', FEEDNOTICE_SUBSCRIBE_OPTION, array(
		'type'              => 'array',
		'sanitize_callback' => 'feednotice_subscribe_sanitize',
	));
});

add_action('admin_menu', function () {
	add_options_page(__('Subscribe by email', 'feednotice-subscribe'), __('Subscribe by email', 'feednotice-subscribe'), 'manage_options', 'feednotice-subscribe', 'feednotice_subscribe_settings_page');
});

function feednotice_subscribe_settings_page() {
	if (!current_user_can('manage_options')) {
		return;
	}
	$o    = feednotice_subscribe_options();
	$name = FEEDNOTICE_SUBSCRIBE_OPTION;
	$preview = feednotice_subscribe_html();
	?>
	<div class="wrap">
	<h1><?php esc_html_e('Subscribe by email', 'feednotice-subscribe'); ?></h1>
	<p><?php esc_html_e('Readers follow a link to the email service, see your latest posts, enter their address and confirm it. Nothing is collected on your site.', 'feednotice-subscribe'); ?></p>
	<form method="post" action="options.php">
	<?php settings_fields('feednotice_subscribe'); ?>
	<table class="form-table" role="presentation">
	<tr><th scope="row"><label for="fns-service"><?php esc_html_e('Service address', 'feednotice-subscribe'); ?></label></th>
		<td><input id="fns-service" class="regular-text code" type="url" name="<?php echo esc_attr($name); ?>[service_url]" value="<?php echo esc_attr($o['service_url']); ?>" placeholder="https://service.example" required>
		<p class="description"><?php esc_html_e('The address of the FeedNotice-based service your readers will use. Nothing is shown until it is set.', 'feednotice-subscribe'); ?></p></td></tr>
	<tr><th scope="row"><?php esc_html_e('Feed', 'feednotice-subscribe'); ?></th>
		<td><fieldset>
		<label><input type="radio" name="<?php echo esc_attr($name); ?>[feed]" value="posts"<?php checked($o['feed'], 'posts'); ?>> <?php esc_html_e('Posts', 'feednotice-subscribe'); ?> <code><?php echo esc_html(get_feed_link()); ?></code></label><br>
		<label><input type="radio" name="<?php echo esc_attr($name); ?>[feed]" value="comments"<?php checked($o['feed'], 'comments'); ?>> <?php esc_html_e('Comments', 'feednotice-subscribe'); ?></label><br>
		<label><input type="radio" name="<?php echo esc_attr($name); ?>[feed]" value="custom"<?php checked($o['feed'], 'custom'); ?>> <?php esc_html_e('Another feed:', 'feednotice-subscribe'); ?></label>
		<input class="regular-text code" type="url" name="<?php echo esc_attr($name); ?>[custom_feed]" value="<?php echo esc_attr($o['custom_feed']); ?>" aria-label="<?php esc_attr_e('Feed address', 'feednotice-subscribe'); ?>">
		</fieldset></td></tr>
	<tr><th scope="row"><label for="fns-text"><?php esc_html_e('Link text', 'feednotice-subscribe'); ?></label></th>
		<td><input id="fns-text" class="regular-text" type="text" name="<?php echo esc_attr($name); ?>[text]" value="<?php echo esc_attr($o['text']); ?>" placeholder="<?php echo esc_attr(feednotice_subscribe_default_text()); ?>"></td></tr>
	<tr><th scope="row"><?php esc_html_e('Look', 'feednotice-subscribe'); ?></th>
		<td><fieldset>
		<label><input type="radio" name="<?php echo esc_attr($name); ?>[style]" value="link"<?php checked($o['style'], 'link'); ?>> <?php esc_html_e('A link, styled by your theme', 'feednotice-subscribe'); ?></label><br>
		<label><input type="radio" name="<?php echo esc_attr($name); ?>[style]" value="button"<?php checked($o['style'], 'button'); ?>> <?php esc_html_e('A button in this colour:', 'feednotice-subscribe'); ?></label>
		<input type="color" name="<?php echo esc_attr($name); ?>[color]" value="<?php echo esc_attr($o['color']); ?>" aria-label="<?php esc_attr_e('Button colour', 'feednotice-subscribe'); ?>">
		</fieldset></td></tr>
	<tr><th scope="row"><?php esc_html_e('After each post', 'feednotice-subscribe'); ?></th>
		<td><label><input type="checkbox" name="<?php echo esc_attr($name); ?>[auto_insert]" value="1"<?php checked($o['auto_insert'], 1); ?>> <?php esc_html_e('Add the link at the end of every post', 'feednotice-subscribe'); ?></label></td></tr>
	<tr><th scope="row"><label for="fns-lang"><?php esc_html_e('Readers\' language', 'feednotice-subscribe'); ?></label></th>
		<td><select id="fns-lang" name="<?php echo esc_attr($name); ?>[lang]">
			<option value="auto"<?php selected($o['lang'], 'auto'); ?>><?php echo esc_html(sprintf(/* translators: %s: language code */ __('This site\'s language (%s)', 'feednotice-subscribe'), substr(get_locale(), 0, 2))); ?></option>
			<option value="none"<?php selected($o['lang'], 'none'); ?>><?php esc_html_e('Each reader\'s browser', 'feednotice-subscribe'); ?></option>
			<?php foreach (array('en' => 'English', 'fr' => 'Français', 'de' => 'Deutsch', 'es' => 'Español') as $code => $label) : ?>
			<option value="<?php echo esc_attr($code); ?>"<?php selected($o['lang'], $code); ?>><?php echo esc_html($label); ?></option>
			<?php endforeach; ?>
		</select>
		<p class="description"><?php esc_html_e('The language of the subscribe page and of the emails. A language the service does not offer falls back to the reader\'s browser.', 'feednotice-subscribe'); ?></p></td></tr>
	</table>
	<?php submit_button(); ?>
	</form>
	<h2><?php esc_html_e('Elsewhere on your site', 'feednotice-subscribe'); ?></h2>
	<p><?php esc_html_e('Widget: Appearance → Widgets, "Subscribe by email". Shortcode, in any post, page or Shortcode block:', 'feednotice-subscribe'); ?></p>
	<p><code>[feednotice_subscribe]</code> · <code>[feednotice_subscribe style="button"]</code> · <code>[feednotice_subscribe feed="current"]</code> · <code>[feednotice_subscribe feed="https://example.org/feed/" text="…"]</code></p>
	<?php if ('' !== $preview) : ?>
	<h2><?php esc_html_e('Preview', 'feednotice-subscribe'); ?></h2>
	<p><?php echo $preview; // phpcs:ignore WordPress.Security.EscapeOutput -- escaped in feednotice_subscribe_html() ?></p>
	<?php endif; ?>
	</div>
	<?php
}

/* A reminder on the Plugins screen until the service is set. */
add_action('admin_notices', function () {
	$screen = function_exists('get_current_screen') ? get_current_screen() : null;
	if (!$screen || 'plugins' !== $screen->id || !current_user_can('manage_options')) {
		return;
	}
	$o = feednotice_subscribe_options();
	if ('' !== $o['service_url']) {
		return;
	}
	echo '<div class="notice notice-info"><p>' . esc_html__('Subscribe by email: set the service address to show the link.', 'feednotice-subscribe')
		. ' <a href="' . esc_url(admin_url('options-general.php?page=feednotice-subscribe')) . '">' . esc_html__('Settings', 'feednotice-subscribe') . '</a></p></div>';
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
	array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=feednotice-subscribe')) . '">' . esc_html__('Settings', 'feednotice-subscribe') . '</a>');
	return $links;
});
