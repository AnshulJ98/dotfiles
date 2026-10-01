-- HTTP requests as plain-text .hurl files, replacing the Postman extension: the
-- same files run headless with `hurl --test` in a terminal or CI. hurl.nvim
-- shells out to the hurl CLI (brew install hurl) and shows the response in a
-- split; `q` closes it.

vim.pack.add { 'https://github.com/jellydn/hurl.nvim' }

-- Deferred to the first hurl buffer: hurl.utils probes for the treesitter
-- parser once, when it is first required, and on 0.12 that probe fails during
-- startup ("Buffer 1 must be loaded to create parser"). A failed probe
-- silently falls back to regex entry detection.
local function setup_hurl()
  require('hurl').setup {
    -- prettier is not installed globally; mason's prettierd reads the body on
    -- stdin and takes its parser from the file name.
    formatters = { html = { 'prettierd', 'response.html' } },
  }
end

vim.api.nvim_create_autocmd('FileType', {
  desc = 'Set up hurl.nvim and its request keymaps',
  group = vim.api.nvim_create_augroup('hurl-keymaps', { clear = true }),
  pattern = 'hurl',
  callback = function(args)
    if not package.loaded.hurl then setup_hurl() end
    local function map(mode, lhs, rhs, desc) vim.keymap.set(mode, lhs, rhs, { buffer = args.buf, desc = desc }) end
    map('n', '<leader>rr', '<Cmd>HurlRunnerAt<CR>', '[R]un the entry under the cursor')
    map('n', '<leader>ra', '<Cmd>HurlRunner<CR>', 'Run [A]ll entries')
    map('n', '<leader>re', '<Cmd>HurlRunnerToEntry<CR>', 'Run from the top to this [E]ntry')
    map('n', '<leader>rE', '<Cmd>HurlRunnerToEnd<CR>', 'Run from this [E]ntry to the end')
    map('n', '<leader>rv', '<Cmd>HurlVerbose<CR>', 'Run [V]erbose')
    map('n', '<leader>rl', '<Cmd>HurlShowLastResponse<CR>', 'Show the [L]ast response')
    map('n', '<leader>rm', '<Cmd>HurlToggleMode<CR>', 'Toggle split/popup [M]ode')
    map('n', '<leader>rs', '<Cmd>HurlSelectEnvFile<CR>', '[S]elect the env file')
    map('x', '<leader>r', ':HurlRunner<CR>', '[R]un the selected entries')
  end,
})
