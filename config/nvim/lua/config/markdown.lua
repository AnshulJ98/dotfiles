vim.api.nvim_create_autocmd('FileType', {
  desc = 'Conceal markdown markup',
  group = vim.api.nvim_create_augroup('markdown-conceal', { clear = true }),
  pattern = 'markdown',
  callback = function() vim.opt_local.conceallevel = 2 end,
})

-- render-markdown is added on the first markdown buffer rather than at startup
-- (5 ms of setup plus its plugin/ file). After init.lua, vim.pack.add sources
-- plugin/ files itself, and render-markdown's reads vim.g.render_markdown_config,
-- runs setup and attaches the current buffer.
vim.api.nvim_create_autocmd('FileType', {
  desc = 'Load the markdown plugins',
  group = vim.api.nvim_create_augroup('markdown-plugins', { clear = true }),
  pattern = 'markdown',
  once = true,
  callback = function()
    vim.g.render_markdown_config = {
      -- No latex parser is installed; checkhealth warned on every run.
      latex = { enabled = false },
      -- As the reading view (markdown_reading.lua) draws headings: md-render's
      -- H1-H6 glyphs, every level at the left edge rather than indented by its
      -- '#' count, and nothing in the sign column.
      heading = {
        icons = { '󰉫  ', '󰉬  ', '󰉭  ', '󰉮  ', '󰉯  ', '󰉰  ' }, -- kitty draws the glyph two cells wide
        position = 'inline',
        sign = false,
      },
    }
    vim.pack.add { 'https://github.com/MeanderingProgrammer/render-markdown.nvim' }
  end,
})
