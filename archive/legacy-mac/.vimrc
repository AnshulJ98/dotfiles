set number
set mouse=a
set clipboard=unnamedplus
syntax on

colorscheme serape
 let g:rainbow_active = 1

 " vimrc - e560 - avivace

set background=dark

set nocompatible              " be iMproved, required
filetype off                  " required

" If vim-plug is not found, install it and every plugin
if empty(glob('~/.vim/autoload/plug.vim'))
  silent !curl -fLo ~/.vim/autoload/plug.vim --create-dirs
    \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
  autocmd VimEnter * PlugInstall --sync | source $MYVIMRC
endif

" Plugins
call plug#begin('~/.vim/plugged')
  Plug 'ConnorHolyday/vim-snazzy'
  "Plug 'vim-airline/vim-airline'
  Plug 'godlygeek/csapprox'
  Plug 'vim-airline/vim-airline-themes'
  Plug 'itchyny/lightline.vim'
  Plug 'scrooloose/nerdtree'
  Plug 'Xuyuanp/nerdtree-git-plugin'
  Plug 'tpope/vim-fugitive'
  Plug 'scrooloose/syntastic'
  Plug 'preservim/nerdcommenter'
  Plug 'majutsushi/tagbar'
  Plug 'valloric/youcompleteme'
  Plug 'godlygeek/tabular'
  Plug 'ervandew/supertab'
  Plug 'pangloss/vim-javascript'
  Plug 'terryma/vim-multiple-cursors'
  Plug 'nathanaelkane/vim-indent-guides'
  Plug 'plasticboy/vim-markdown'
  Plug 'benmills/vimux'
  Plug 'junegunn/gv.vim'
  Plug 'vim-scripts/taglist.vim'
  Plug 'bronson/vim-trailing-whitespace'
  Plug 'octol/vim-cpp-enhanced-highlight'
call plug#end()

" Color scheme
syntax on
set t_Co=256
colorscheme snazzy

let g:lightline = {
\ 'colorscheme': 'snazzy',
\ }

" Show airline
set laststatus=2

" .pl for prolog, not perl
au BufRead,BufNewFile *.pl set filetype=prolog

" jj brings you the normal mode
:imap jj <Esc>

" Indentation
set tabstop=2
set shiftwidth=2
set softtabstop=2
set expandtab

" Code readability
set number
set colorcolumn=80

set termguicolors

set noshowmode

set shortmess=I
map <C-t> :NERDTreeToggle<CR>

