"""Mapped with map <key> kitten zdo.py <words>; runs on kitty's UI thread."""
import sys

from kittens.tui.handler import result_handler


def main(args):
    pass


@result_handler(no_ui=True)
def handle_result(args, answer, target_window_id, boss):
    try:
        from kitty.constants import config_dir
        if config_dir not in sys.path:
            sys.path.insert(0, config_dir)
        import zkitty
        zkitty.safe(zkitty.run)(boss, list(args[1:]))
    except Exception:
        # Import/bootstrap failures must not escape into kitty either.
        try:
            import traceback
            import zkitty
            zkitty.log(traceback.format_exc())
        except Exception:
            pass
