import os

from .. import run
from pkg.sub import other


def main() -> int:
    return run(len(os.sep)) + other.value()
