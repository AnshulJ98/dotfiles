-- Rounded panes, matching kitty's window_border_radius.
require('full-border'):setup { type = ui.Border.ROUNDED }

require('git'):setup { order = 1500 }

-- Finder tags, drawn in the Bearded palette rather than Apple's.
require('mactag'):setup {
  keys = { r = 'Red', o = 'Orange', y = 'Yellow', g = 'Green', b = 'Blue', p = 'Purple' },
  colors = {
    Red = '#fd604f',
    Orange = '#ffaa7d',
    Yellow = '#f5df76',
    Green = '#afea7b',
    Blue = '#7fd7f5',
    Purple = '#e4a3df',
  },
  order = 500,
}

-- Directories browsed in yazi join zoxide's ranking, not just shell `cd`s.
require('zoxide'):setup { update_db = true }
