-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua

-- PDF viewing: open PDFs as text in a scratch buffer using pdftotext
-- Requires: brew install poppler
vim.api.nvim_create_autocmd("BufReadPost", {
  group = vim.api.nvim_create_augroup("pdf_to_text", { clear = true }),
  pattern = "*.pdf",
  callback = function(args)
    if vim.fn.executable("pdftotext") ~= 1 then
      vim.notify("pdftotext not found. Install: brew install poppler", vim.log.levels.WARN)
      return
    end
    local filename = vim.api.nvim_buf_get_name(args.buf)
    local output = vim.fn.systemlist({ "pdftotext", "-layout", filename, "-" })

    if vim.v.shell_error ~= 0 then
      vim.notify("pdftotext failed on: " .. filename, vim.log.levels.ERROR)
      return
    end

    vim.bo[args.buf].modifiable = true
    vim.api.nvim_buf_set_lines(args.buf, 0, -1, false, output)
    vim.bo[args.buf].modifiable = false
    vim.bo[args.buf].buftype = "nofile"
    vim.bo[args.buf].filetype = "text"
    vim.api.nvim_buf_set_name(args.buf, filename .. " [PDF Text]")
  end,
})
