-- Two scratch buffers, both prompting for a type that defaults to the current
-- buffer's, so a scratch opened from a .sql or .hurl file starts as the same.
--
-- Throwaway follows :h scratch-buffer: no file, no swap file, never asks to be
-- saved, gone when nvim quits. hurl.nvim reads the file on disk for every
-- runner except the visual one, so in a throwaway .hurl only `<leader>r` on a
-- selection sends anything.
--
-- Persistent is one real file per extension under stdpath('data')/scratch,
-- the counterpart of a VS Code Untitled tab kept by hot exit, except that it
-- is saved with :w like any other file.

local scratch_dir = vim.fs.joinpath(vim.fn.stdpath 'data', 'scratch')

local function open_throwaway()
  vim.ui.input({ prompt = 'Throwaway filetype: ', default = vim.bo.filetype, completion = 'filetype' }, function(filetype)
    if not filetype then return end
    vim.cmd.enew()
    vim.bo.buftype = 'nofile'
    vim.bo.bufhidden = 'hide'
    vim.bo.swapfile = false
    vim.bo.filetype = filetype
  end)
end

local function open_persistent()
  local current = vim.fn.expand '%:e'
  vim.ui.input({ prompt = 'Scratch extension: ', default = current ~= '' and current or 'md' }, function(extension)
    if not extension or extension == '' then return end
    -- The extension becomes part of a path, so anything beyond a plain suffix
    -- could escape the scratch directory.
    if not extension:match '^[%w_-]+$' then
      vim.notify('Scratch extension must be letters, digits, - or _: ' .. extension, vim.log.levels.ERROR)
      return
    end
    vim.fn.mkdir(scratch_dir, 'p')
    vim.cmd.edit(vim.fn.fnameescape(vim.fs.joinpath(scratch_dir, 'scratch.' .. extension)))
  end)
end

vim.keymap.set('n', '<leader>xx', open_throwaway, { desc = 'Throwaway scratch buffer' })
vim.keymap.set('n', '<leader>xf', open_persistent, { desc = 'Persistent scratch [F]ile' })
